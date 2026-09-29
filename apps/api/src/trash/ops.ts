import path from "node:path";
import { existsSync, mkdirSync, renameSync, rmSync, rmdirSync, statSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { normSeg, pathParts } from "@vd/shared";
import { getDb, getSourceRow } from "../db";
import { files, sources, trashItems } from "../db/schema";
import { TRASH_DIR } from "../config";

/**
 * Trash operations — the ONLY code that mutates files on the source drives.
 * Every entry point here must be called inside the ops worker subprocess
 * (see manager.ts): these are synchronous fs calls, and on a wedged FUSE
 * mount they block forever — running them on the API's event loop is what
 * froze the server once already.
 */

export type TrashOp =
  | {
      op: "move";
      sourceId: number;
      rows: { id: number; relPath: string; size: number; hash: string | null }[];
    }
  | { op: "restore"; itemId: number }
  | { op: "purge"; itemId: number }
  | { op: "purge-all" };

export interface MoveFailure {
  relPath: string;
  error: string;
}

export interface MoveResult {
  movedIds: number[];
  bytes: number;
  failures: MoveFailure[];
}

/** Move the given file rows of one source into .vipdedup-trash/<runId>/… */
export function moveFilesToTrash(
  sourceId: number,
  rows: { id: number; relPath: string; size: number; hash: string | null }[],
): MoveResult {
  const { db, sqlite } = getDb();
  const source = getSourceRow(sourceId);
  if (!source) throw new Error(`unknown source ${sourceId}`);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const movedIds: number[] = [];
  const failures: MoveFailure[] = [];
  let bytes = 0;

  const insertItem = sqlite.prepare(
    `INSERT INTO trash_items (source_id, original_rel_path, staged_rel_path, size, hash, trashed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const touchedDirs = new Set<string>();

  for (const row of rows) {
    const stagedRel = `${TRASH_DIR}/${runId}/${row.relPath}`;
    const absOrig = path.join(source.path, row.relPath);
    const absStaged = path.join(source.path, stagedRel);
    try {
      mkdirSync(path.dirname(absStaged), { recursive: true });
      renameSync(absOrig, absStaged);
      insertItem.run(sourceId, row.relPath, stagedRel, row.size, row.hash, new Date().toISOString());
      movedIds.push(row.id);
      bytes += row.size;
      const { dir } = pathParts(row.relPath);
      if (dir !== "") touchedDirs.add(dir);
    } catch (e) {
      failures.push({ relPath: row.relPath, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (movedIds.length > 0) db.delete(files).where(inArray(files.id, movedIds)).run();

  // sweep now-empty parent directories left behind (rmdir fails on non-empty)
  for (const dir of touchedDirs) {
    let cur = dir;
    while (cur !== "" && cur !== TRASH_DIR) {
      try {
        rmdirSync(path.join(source.path, cur)); // fails on non-empty — stop climbing
      } catch {
        break;
      }
      const cut = cur.lastIndexOf("/");
      cur = cut === -1 ? "" : cur.slice(0, cut);
    }
  }

  return { movedIds, bytes, failures };
}

/** Remove now-empty staged ancestors, including the trash root itself. */
function sweepEmptyDirs(root: string, relDir: string) {
  let cur = relDir;
  while (cur === TRASH_DIR || cur.startsWith(`${TRASH_DIR}/`)) {
    try {
      rmdirSync(path.join(root, cur)); // fails on non-empty — that's the stop condition
    } catch {
      return;
    }
    const cut = cur.lastIndexOf("/");
    if (cut === -1) return;
    cur = cur.slice(0, cut);
  }
}

export function listTrashItems() {
  const { db } = getDb();
  return db
    .select({
      id: trashItems.id,
      sourceId: trashItems.sourceId,
      originalRelPath: trashItems.originalRelPath,
      size: trashItems.size,
      trashedAt: trashItems.trashedAt,
      label: sources.label,
    })
    .from(trashItems)
    .innerJoin(sources, eq(sources.id, trashItems.sourceId))
    .orderBy(trashItems.trashedAt)
    .all();
}

export type RestoreOutcome =
  | { ok: true; relPath: string }
  | { ok: false; code: "not-found" | "missing-staged" | "occupied"; error: string }
  | { ok: false; code: "io"; error: string };

/** Move a staged file back to its original path and reindex it. */
export function restoreItem(itemId: number): RestoreOutcome {
  const { db } = getDb();
  const item = db.select().from(trashItems).where(eq(trashItems.id, itemId)).get();
  if (!item) return { ok: false, code: "not-found", error: "trash item not found" };
  const source = getSourceRow(item.sourceId);
  if (!source) return { ok: false, code: "not-found", error: "source not found" };
  const absStaged = path.join(source.path, item.stagedRelPath);
  const absOrig = path.join(source.path, item.originalRelPath);
  if (!existsSync(absStaged))
    return { ok: false, code: "missing-staged", error: "staged file no longer exists (purged?)" };
  if (existsSync(absOrig))
    return { ok: false, code: "occupied", error: "original path already occupied" };
  try {
    mkdirSync(path.dirname(absOrig), { recursive: true });
    renameSync(absStaged, absOrig);
  } catch (e) {
    return { ok: false, code: "io", error: e instanceof Error ? e.message : String(e) };
  }
  const st = statSync(absOrig);
  const { dir, name, top } = pathParts(item.originalRelPath);
  db.insert(files)
    .values({
      sourceId: item.sourceId,
      relPath: item.originalRelPath,
      relNorm: normSeg(item.originalRelPath),
      name,
      nameNorm: normSeg(name),
      dir,
      top,
      topNorm: normSeg(top),
      size: st.size,
      mtime: st.mtime.toISOString(),
      hash: item.hash ?? null,
      scannedAt: new Date().toISOString(),
    })
    .run();
  const stagedDir = pathParts(item.stagedRelPath).dir;
  sweepEmptyDirs(source.path, stagedDir);
  db.delete(trashItems).where(eq(trashItems.id, item.id)).run();
  return { ok: true, relPath: item.originalRelPath };
}

export type PurgeOutcome = { ok: true } | { ok: false; code: "not-found"; error: string } | { ok: false; code: "io"; error: string };

/** Permanently delete one staged file. */
export function purgeItem(itemId: number): PurgeOutcome {
  const { db } = getDb();
  const item = db.select().from(trashItems).where(eq(trashItems.id, itemId)).get();
  if (!item) return { ok: false, code: "not-found", error: "trash item not found" };
  const source = getSourceRow(item.sourceId);
  if (!source) return { ok: false, code: "not-found", error: "source not found" };
  const absStaged = path.join(source.path, item.stagedRelPath);
  try {
    rmSync(absStaged, { recursive: true, force: true });
  } catch (e) {
    return { ok: false, code: "io", error: e instanceof Error ? e.message : String(e) };
  }
  const dir = pathParts(item.stagedRelPath).dir;
  sweepEmptyDirs(source.path, dir);
  db.delete(trashItems).where(eq(trashItems.id, itemId)).run();
  return { ok: true };
}

export function purgeAllItems(): { purged: number; failures: { id: number; error: string }[] } {
  const failures: { id: number; error: string }[] = [];
  let purged = 0;
  for (const item of listTrashItems()) {
    const outcome = purgeItem(item.id);
    if (outcome.ok) purged += 1;
    else failures.push({ id: item.id, error: outcome.error });
  }
  return { purged, failures };
}
