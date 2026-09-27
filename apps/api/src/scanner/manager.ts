import path from "node:path";
import { eq, and, desc } from "drizzle-orm";
import { getDb, getDbPath, getSourceRow } from "../db";
import { files, scanRuns } from "../db/schema";
import { SCAN_TIMEOUT_MS } from "../config";
import { runScan } from "./scan";

/**
 * Scan lifecycle manager. Each scan runs in its own `bun worker.ts` subprocess
 * under a watchdog: the Mounty NTFS mounts can wedge at the FUSE layer where
 * fs calls block forever with zero disk I/O — only a kill unblocks those.
 */
const running = new Map<number, { pid: number | undefined }>();

export function isScanning(sourceId: number): boolean {
  return running.has(sourceId);
}

export function scanningSourceIds(): number[] {
  return [...running.keys()];
}

export function startScan(sourceId: number): { started: boolean; reason?: string } {
  if (running.has(sourceId)) return { started: false, reason: "scan already running" };
  if (!getSourceRow(sourceId)) return { started: false, reason: "unknown source" };

  const workerPath = path.join(import.meta.dir, "worker.ts");
  const proc = Bun.spawn([process.execPath, workerPath, String(sourceId)], {
    env: { ...process.env, VIPDEDUP_DB: getDbPath() },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  running.set(sourceId, { pid: proc.pid });
  void supervise(sourceId, proc);
  return { started: true };
}

async function supervise(sourceId: number, proc: Bun.Subprocess<"ignore", "pipe", "pipe">) {
  const killTimer = setTimeout(() => {
    try {
      proc.kill();
      setTimeout(() => {
        try {
          proc.kill(9);
        } catch {
          /* already gone */
        }
      }, 2000);
    } catch {
      /* already gone */
    }
    markInterrupted(sourceId, `scan timed out after ${SCAN_TIMEOUT_MS / 60000} min (unresponsive mount?)`);
  }, SCAN_TIMEOUT_MS);

  const code = await proc.exited;
  clearTimeout(killTimer);
  running.delete(sourceId);
  if (code !== 0) markInterrupted(sourceId, `scan worker exited with code ${code}`);
}

/** If the worker died before finishing its run row, close it out + drop partials. */
function markInterrupted(sourceId: number, message: string) {
  const { db } = getDb();
  const current = db
    .select()
    .from(scanRuns)
    .where(eq(scanRuns.sourceId, sourceId))
    .orderBy(desc(scanRuns.id))
    .get();
  if (!current || current.status !== "running") return;
  db.update(scanRuns)
    .set({ status: "timeout", error: message, finishedAt: new Date().toISOString() })
    .where(eq(scanRuns.id, current.id))
    .run();
  db.delete(files).where(and(eq(files.sourceId, sourceId))).run();
}

/** Boot-time cleanup: runs left "running" by a crashed API process are stale. */
export function cleanupStaleRuns() {
  const { db } = getDb();
  const stale = db.select().from(scanRuns).where(eq(scanRuns.status, "running")).all();
  for (const run of stale) {
    db.update(scanRuns)
      .set({ status: "error", error: "interrupted by restart", finishedAt: new Date().toISOString() })
      .where(eq(scanRuns.id, run.id))
      .run();
    db.delete(files).where(eq(files.sourceId, run.sourceId)).run();
  }
}

/* —— availability checks ———————————————————— */

/**
 * stat() each source path inside a throwaway subprocess: on a wedged FUSE
 * mount even stat can block, and that must never hang the API server.
 */
export async function checkOnline(paths: { id: number; path: string }[]): Promise<Map<number, boolean>> {
  const out = new Map<number, boolean>();
  for (const p of paths) out.set(p.id, false);
  if (paths.length === 0) return out;

  const script = `
    const { statSync } = require("node:fs");
    const paths = ${JSON.stringify(paths.map((p) => p.path))};
    const out = [];
    for (const p of paths) {
      try { out.push(statSync(p).isDirectory()); } catch { out.push(false); }
    }
    process.stdout.write(JSON.stringify(out));
  `;
  const proc = Bun.spawn([process.execPath, "-e", script], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  });
  try {
    const text = await Promise.race([
      new Response(proc.stdout).text(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ]);
    const results = JSON.parse(text.trim()) as boolean[];
    paths.forEach((p, i) => out.set(p.id, results[i] === true));
  } catch {
    // subprocess hung or printed garbage — report everything offline
  } finally {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }
  return out;
}

export { runScan };
