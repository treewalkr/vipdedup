import path from "node:path";
import { readdirSync, statSync } from "node:fs";
import { eq } from "drizzle-orm";
import { normSeg, pathParts } from "@vd/shared";
import { getDb, getSourceRow } from "../db";
import { files, scanRuns } from "../db/schema";
import { isIgnoredName } from "./ignore";

export interface ScanOutcome {
  status: "ok" | "error";
  fileCount: number;
  bytes: number;
  hashedCount: number;
  error?: string;
}

type FileInsert = typeof files.$inferInsert;

const BATCH = 500;

function rowFor(rel: string, size: number, mtime: string): Omit<FileInsert, "sourceId"> {
  const { dir, name, top } = pathParts(rel);
  const now = new Date().toISOString();
  return {
    relPath: rel,
    relNorm: normSeg(rel),
    name,
    nameNorm: normSeg(name),
    dir,
    top,
    topNorm: normSeg(top),
    size,
    mtime,
    scannedAt: now,
  };
}

/** Iterative walk; unreadable directories are skipped, not fatal. */
function* walk(root: string, sourceId: number): Generator<FileInsert> {
  const stack: string[] = [""];
  while (stack.length > 0) {
    const relDir = stack.pop()!;
    const absDir = relDir === "" ? root : path.join(root, relDir);
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (isIgnoredName(entry.name) || entry.isSymbolicLink()) continue;
      const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        stack.push(rel);
      } else if (entry.isFile()) {
        try {
          const st = statSync(path.join(root, rel));
          yield { ...rowFor(rel, st.size, st.mtime.toISOString()), sourceId };
        } catch {
          // vanished or unreadable between readdir and stat — skip
        }
      }
    }
  }
}

const CHUNK = 8 * 1024 * 1024;

/** Streaming SHA-256 — chunked so multi-GB videos never sit whole in memory. */
export async function hashFile(absPath: string): Promise<string> {
  const file = Bun.file(absPath);
  const hasher = new Bun.CryptoHasher("sha256");
  for (let off = 0; off < file.size; off += CHUNK) {
    hasher.update(new Uint8Array(await file.slice(off, off + CHUNK).arrayBuffer()));
  }
  return hasher.digest("hex");
}

/**
 * Fill in hashes for duplicate *candidates* only: files that share
 * (relNorm + size) or (nameNorm + size) with a file in ANOTHER source.
 * Candidates may live in any source — a fresh scan of one source can newly
 * expose candidates among the others' rows.
 */
async function hashCandidates(runId: number): Promise<number> {
  const { sqlite } = getDb();
  const candidates = sqlite
    .prepare(
      `SELECT f.id, s.path AS root, f.rel_path
       FROM files f JOIN sources s ON s.id = f.source_id
       WHERE f.hash IS NULL AND (
         EXISTS (SELECT 1 FROM files g
                 WHERE g.rel_norm = f.rel_norm AND g.size = f.size AND g.source_id <> f.source_id)
         OR EXISTS (SELECT 1 FROM files g
                    WHERE g.name_norm = f.name_norm AND g.size = f.size AND g.source_id <> f.source_id)
       )`,
    )
    .all() as { id: number; root: string; rel_path: string }[];

  let done = 0;
  const patch = sqlite.prepare("UPDATE files SET hash = ? WHERE id = ?");
  const bump = sqlite.prepare("UPDATE scan_runs SET hashed_count = hashed_count + ? WHERE id = ?");
  for (const c of candidates) {
    try {
      patch.run(await hashFile(path.join(c.root, c.rel_path)), c.id);
    } catch {
      // unreadable/offline — stays unhashed, shown as "unverified"
    }
    done += 1;
    if (done % 20 === 0) bump.run(20, runId);
  }
  if (done % 20 > 0 || done === 0) bump.run(done % 20, runId);
  return candidates.length;
}

/**
 * Full scan of one source: snapshot swap + hash pass. Runs inside a worker
 * subprocess (see manager.ts) because a wedged FUSE mount can block fs calls
 * indefinitely — the manager's watchdog owns the timeout.
 */
export async function runScan(sourceId: number): Promise<ScanOutcome> {
  const { db } = getDb();
  const source = getSourceRow(sourceId);
  if (!source) throw new Error(`unknown source ${sourceId}`);

  const now = () => new Date().toISOString();
  const run = db
    .insert(scanRuns)
    .values({ sourceId, startedAt: now(), status: "running", phase: "scan", fileCount: 0, hashedCount: 0 })
    .returning()
    .get();

  try {
    try {
      if (!statSync(source.path).isDirectory()) throw new Error(`not a directory: ${source.path}`);
    } catch (e) {
      const msg = `source not accessible: ${source.path}`;
      db.update(scanRuns)
        .set({ status: "error", error: msg, finishedAt: now() })
        .where(eq(scanRuns.id, run.id))
        .run();
      return { status: "error", fileCount: 0, bytes: 0, hashedCount: 0, error: msg };
    }

    // snapshot semantics: clear this source's previous rows, stream in the new
    db.delete(files).where(eq(files.sourceId, sourceId)).run();

    let batch: FileInsert[] = [];
    let count = 0;
    let bytes = 0;
    const flush = () => {
      if (batch.length === 0) return;
      db.insert(files).values(batch).run();
      batch = [];
      db.update(scanRuns)
        .set({ fileCount: count, bytes })
        .where(eq(scanRuns.id, run.id))
        .run();
    };
    for (const row of walk(source.path, sourceId)) {
      batch.push(row);
      count += 1;
      bytes += row.size;
      if (batch.length >= BATCH) flush();
    }
    flush();

    db.update(scanRuns).set({ phase: "hash" }).where(eq(scanRuns.id, run.id)).run();
    const hashed = await hashCandidates(run.id);

    db.update(scanRuns)
      .set({ status: "ok", phase: "done", finishedAt: now(), fileCount: count, bytes, hashedCount: hashed })
      .where(eq(scanRuns.id, run.id))
      .run();
    return { status: "ok", fileCount: count, bytes, hashedCount: hashed };
  } catch (e) {
    // drop the partial snapshot so stale half-scans never look like truth
    db.delete(files).where(eq(files.sourceId, sourceId)).run();
    const msg = e instanceof Error ? e.message : String(e);
    db.update(scanRuns)
      .set({ status: "error", error: msg, finishedAt: now() })
      .where(eq(scanRuns.id, run.id))
      .run();
    return { status: "error", fileCount: 0, bytes: 0, hashedCount: 0, error: msg };
  }
}
