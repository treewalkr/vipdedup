import path from "node:path";
import { getDb, getDbPath } from "../db";
import type { TrashOp } from "./ops";

/**
 * Trash ops lifecycle manager — same pattern as the scan manager: spawn a
 * worker subprocess, watchdog it, never let a wedged FUSE mount block the
 * API. Operations are serialized so two trash actions can't interleave fs
 * mutations on the same drive.
 */

const TRASH_TIMEOUT_MS = Number(process.env.TRASH_TIMEOUT_MS ?? 10 * 60_000);

export interface TrashOpResult {
  ok: boolean;
  code?: string;
  error?: string;
  [key: string]: unknown;
}

let queue: Promise<unknown> = Promise.resolve();

export function runTrashOp(op: TrashOp): Promise<TrashOpResult> {
  const next = queue.then(() => execOp(op));
  queue = next.catch(() => undefined); // keep the queue alive after failures
  return next;
}

async function execOp(op: TrashOp): Promise<TrashOpResult> {
  const workerPath = path.join(import.meta.dir, "ops-worker.ts");
  const proc = Bun.spawn([process.execPath, workerPath, JSON.stringify(op)], {
    env: { ...process.env, VIPDEDUP_DB: currentDbPath() },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
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
  }, TRASH_TIMEOUT_MS);

  try {
    const text = await new Response(proc.stdout).text();
    await proc.exited;
    const parsed = JSON.parse(text.trim().split("\n").at(-1) ?? "{}") as TrashOpResult;
    return parsed;
  } catch {
    if (timedOut) {
      return {
        ok: false,
        code: "timeout",
        error: `trash operation timed out after ${TRASH_TIMEOUT_MS / 60000} min — the mount is unresponsive. Remount the drive, then retry or restore.`,
      };
    }
    return { ok: false, code: "worker", error: "trash worker failed unexpectedly" };
  } finally {
    clearTimeout(timer);
  }
}

/** The live handle's path (tests swap in temp DBs) or the env/default path. */
function currentDbPath(): string {
  try {
    return getDb().dbPath ?? getDbPath();
  } catch {
    return getDbPath();
  }
}
