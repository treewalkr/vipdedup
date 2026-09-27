import type {
  FileGroupDto,
  FolderGroupDto,
  GroupSourceRowDto,
  GroupStatus,
  OverlapSummaryDto,
} from "@vd/shared";
import { getDb } from "../db";

/**
 * Matching engine — pure functions over an in-memory snapshot of all file
 * rows (a few thousand per drive; loading everything keeps the logic testable
 * and lets folder/file/matrix views share one pass).
 */

export interface FileRow {
  id: number;
  sourceId: number;
  sourceLabel: string;
  relPath: string;
  relNorm: string;
  name: string;
  nameNorm: string;
  dir: string;
  top: string;
  topNorm: string;
  size: number;
  mtime: string;
  hash: string | null;
}

export function loadFileRows(): FileRow[] {
  const { sqlite } = getDb();
  return (
    sqlite
      .prepare(
        `SELECT f.id, f.source_id, s.label, f.rel_path, f.rel_norm, f.name, f.name_norm,
                f.dir, f.top, f.top_norm, f.size, f.mtime, f.hash
         FROM files f JOIN sources s ON s.id = f.source_id`,
      )
      .all() as unknown as Record<string, unknown>[]
  ).map((r) => ({
    id: r.id as number,
    sourceId: r.source_id as number,
    sourceLabel: r.label as string,
    relPath: r.rel_path as string,
    relNorm: r.rel_norm as string,
    name: r.name as string,
    nameNorm: r.name_norm as string,
    dir: r.dir as string,
    top: r.top as string,
    topNorm: r.top_norm as string,
    size: r.size as number,
    mtime: r.mtime as string,
    hash: (r.hash as string | null) ?? null,
  }));
}

/** identical < partial < unverified < differ — worst evidence wins. */
export function statusOfCopies(copies: { size: number; hash: string | null }[]): GroupStatus {
  const hashes = new Set(copies.filter((c) => c.hash !== null).map((c) => c.hash));
  const sizes = new Set(copies.map((c) => c.size));
  if (hashes.size > 1 || sizes.size > 1) return "differ";
  if (copies.every((c) => c.hash !== null)) return "identical";
  if (copies.every((c) => c.hash === null)) return "unverified";
  return "partial";
}

/** identical < partial < unverified < differ — worst evidence wins. */
const SEVERITY: Record<GroupStatus, number> = { identical: 0, partial: 1, unverified: 2, differ: 3 };

/** Status across several file identities (e.g. every file inside a folder): worst wins. */
function groupStatus(copiesLists: { size: number; hash: string | null }[][]): GroupStatus {
  let worst: GroupStatus = "identical";
  for (const copies of copiesLists) {
    const s = statusOfCopies(copies);
    if (SEVERITY[s] > SEVERITY[worst]) worst = s;
  }
  return worst;
}

function sum(rows: { size: number }[]): number {
  return rows.reduce((acc, r) => acc + r.size, 0);
}

function distinctSources(rows: FileRow[]): Set<number> {
  return new Set(rows.map((r) => r.sourceId));
}

function sourceRowsFor(
  bySource: Map<number, FileRow[]>,
  matchedBySource: Map<number, Set<string>>, // sourceId → relNorms with a copy elsewhere in the group
): GroupSourceRowDto[] {
  return [...bySource.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sourceId, rows]) => {
      const matched = rows.filter((r) => matchedBySource.get(sourceId)?.has(r.relNorm));
      return {
        sourceId,
        label: rows[0].sourceLabel,
        fileCount: rows.length,
        bytes: sum(rows),
        matchedCount: matched.length,
        matchedBytes: sum(matched),
        hashedCount: rows.filter((r) => r.hash !== null).length,
        exampleRelPath: rows[0].relPath,
        mtime: rows.map((r) => r.mtime).sort().at(-1) ?? null,
      };
    });
}

/** Copies (per relNorm) that exist in ≥2 sources → the actual duplicate payload. */
function multiCopyEntries(rows: FileRow[]): Map<string, FileRow[]> {
  const byRel = new Map<string, FileRow[]>();
  for (const r of rows) {
    const list = byRel.get(r.relNorm);
    if (list) list.push(r);
    else byRel.set(r.relNorm, [r]);
  }
  for (const [key, copies] of byRel) {
    if (distinctSources(copies).size < 2) byRel.delete(key);
  }
  return byRel;
}

/** Best-case reclaimable bytes for one identity: total − largest copy. */
function reclaimable(copies: FileRow[]): number {
  return sum(copies) - Math.max(...copies.map((c) => c.size));
}

/* —— folder-level groups ———————————————————— */

export function computeFolderGroups(rows: FileRow[]): FolderGroupDto[] {
  const byTop = new Map<string, FileRow[]>();
  for (const r of rows) {
    if (r.topNorm === "") continue; // loose top-level files → file groups
    const list = byTop.get(r.topNorm);
    if (list) list.push(r);
    else byTop.set(r.topNorm, [r]);
  }

  const groups: FolderGroupDto[] = [];
  for (const [topNorm, all] of byTop) {
    if (distinctSources(all).size < 2) continue;

    const multi = multiCopyEntries(all);
    const matchedBySource = new Map<number, Set<string>>();
    for (const copies of multi.values()) {
      const sourceIds = [...distinctSources(copies)];
      for (const sid of sourceIds) {
        const set = matchedBySource.get(sid) ?? new Set<string>();
        set.add(copies[0].relNorm);
        matchedBySource.set(sid, set);
      }
    }

    const bySource = new Map<number, FileRow[]>();
    for (const r of all) {
      const list = bySource.get(r.sourceId);
      if (list) list.push(r);
      else bySource.set(r.sourceId, [r]);
    }

    groups.push({
      key: `folder:${topNorm}`,
      kind: "folder",
      name: all[0].top,
      sources: sourceRowsFor(bySource, matchedBySource),
      fileCount: all.length,
      dupFileCount: multi.size,
      dupBytes: [...multi.values()].reduce((acc, copies) => acc + reclaimable(copies), 0),
      status: groupStatus([...multi.values()]),
    });
  }
  return groups.sort((a, b) => b.dupBytes - a.dupBytes || a.name.localeCompare(b.name));
}

/* —— file-level groups ———————————————————— */

function toFileGroup(
  key: string,
  matchBasis: "path" | "hash",
  relNorm: string | null,
  copies: FileRow[],
): FileGroupDto {
  const bySource = new Map<number, FileRow[]>();
  for (const r of copies) {
    const list = bySource.get(r.sourceId);
    if (list) list.push(r);
    else bySource.set(r.sourceId, [r]);
  }
  const matchedBySource = new Map<number, Set<string>>();
  for (const [sid] of bySource) {
    matchedBySource.set(sid, new Set(copies.map((c) => c.relNorm)));
  }
  const example = copies[0];
  const commonHash = copies.every((c) => c.hash !== null) ? example.hash : null;
  return {
    key,
    kind: "file",
    matchBasis,
    name: relNorm === null ? example.name : relNorm.split("/").pop()!,
    relPath: relNorm === null ? null : example.relPath,
    size: Math.max(...copies.map((c) => c.size)),
    hash: commonHash,
    sources: sourceRowsFor(bySource, matchedBySource),
    dupBytes: reclaimable(copies),
    status: statusOfCopies(copies),
  };
}

export function computeFileGroups(rows: FileRow[]): FileGroupDto[] {
  const groups: FileGroupDto[] = [];

  // 1) same relative path in ≥2 sources
  const byRel = new Map<string, FileRow[]>();
  for (const r of rows) {
    const list = byRel.get(r.relNorm);
    if (list) list.push(r);
    else byRel.set(r.relNorm, [r]);
  }
  const relGroups = new Map<string, FileGroupDto>();
  for (const [relNorm, copies] of byRel) {
    if (distinctSources(copies).size < 2) continue;
    const g = toFileGroup(`path:${relNorm}`, "path", relNorm, copies);
    relGroups.set(relNorm, g);
    groups.push(g);
  }

  // 2) byte-identical copies under different paths (hash catches renamed folders)
  const byHash = new Map<string, FileRow[]>();
  for (const r of rows) {
    if (r.hash === null) continue;
    const list = byHash.get(r.hash);
    if (list) list.push(r);
    else byHash.set(r.hash, [r]);
  }
  for (const [hash, copies] of byHash) {
    const relNorms = new Set(copies.map((c) => c.relNorm));
    if (relNorms.size < 2 || distinctSources(copies).size < 2) continue;
    // cross-path copies of files that are ALSO path-matched stay inside their
    // path group; only report the genuinely relocated ones here
    const relocated = copies.filter((c) => !relGroups.has(c.relNorm) || !relGroups.get(c.relNorm)!.sources.some((s) => s.sourceId === c.sourceId));
    if (distinctSources(relocated).size < 2) continue;
    groups.push(toFileGroup(`hash:${hash}`, "hash", null, relocated));
  }

  return groups.sort((a, b) => b.dupBytes - a.dupBytes || a.name.localeCompare(b.name));
}

/* —— overlap summary + matrix ———————————————— */

export function computeOverlapSummary(rows: FileRow[], sources: { id: number }[]): OverlapSummaryDto {
  const folderGroups = computeFolderGroups(rows);
  const fileGroups = computeFileGroups(rows);

  const matrix: OverlapSummaryDto["matrix"] = [];
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i].id;
      const b = sources[j].id;
      const rowsA = rows.filter((r) => r.sourceId === a);
      const rowsB = rows.filter((r) => r.sourceId === b);
      const relB = new Set(rowsB.map((r) => r.relNorm));
      const shared = rowsA.filter((r) => relB.has(r.relNorm));
      const sizeByRelB = new Map(rowsB.map((r) => [r.relNorm, r.size] as const));
      const sharedBytes = shared.reduce((acc, r) => acc + Math.min(r.size, sizeByRelB.get(r.relNorm) ?? 0), 0);
      const topsA = new Set(rowsA.map((r) => r.topNorm).filter((t) => t !== ""));
      const topsB = new Set(rowsB.map((r) => r.topNorm).filter((t) => t !== ""));
      let sharedFolders = 0;
      for (const t of topsA) if (topsB.has(t)) sharedFolders += 1;
      matrix.push({ aId: a, bId: b, sharedFolders, sharedFiles: shared.length, sharedBytes });
    }
  }

  return {
    folderGroups: folderGroups.length,
    fileGroups: fileGroups.length,
    confirmedGroups: fileGroups.filter((g) => g.status === "identical").length,
    differingGroups: fileGroups.filter((g) => g.status === "differ").length,
    reclaimableBytes: fileGroups.reduce((acc, g) => acc + g.dupBytes, 0),
    matrix,
  };
}

/* —— trash membership resolution ——————————————— */

export interface TrashMember {
  fileId: number;
  sourceId: number;
  relPath: string;
  size: number;
  hash: string | null;
}

/**
 * Resolve which concrete files a "keep <source>" action should stage, at
 * action time, from a group key:
 *   folder:<topNorm> — non-keep copies that have a counterpart in the keep
 *                      source (same path; content-equal when both hashed,
 *                      size-equal otherwise)
 *   path:<relNorm>   — every copy except the keep source's
 *   hash:<hex>       — every byte-identical copy except the keep source's
 */
export function resolveGroupMembers(rows: FileRow[], key: string, keepSourceId: number): TrashMember[] {
  if (key.startsWith("folder:")) {
    const topNorm = key.slice("folder:".length);
    const group = rows.filter((r) => r.topNorm === topNorm);
    const keep = group.filter((r) => r.sourceId === keepSourceId);
    if (keep.length === 0) throw new Error("keep source not part of this group");
    const keepByRel = new Map<string, FileRow[]>();
    for (const r of keep) {
      const list = keepByRel.get(r.relNorm);
      if (list) list.push(r);
      else keepByRel.set(r.relNorm, [r]);
    }
    const members: TrashMember[] = [];
    for (const r of group) {
      if (r.sourceId === keepSourceId) continue;
      const counterparts = keepByRel.get(r.relNorm);
      if (!counterparts) continue;
      const safe = counterparts.some((k) =>
        k.hash !== null && r.hash !== null ? k.hash === r.hash : k.size === r.size,
      );
      if (safe) members.push({ fileId: r.id, sourceId: r.sourceId, relPath: r.relPath, size: r.size, hash: r.hash });
    }
    return members;
  }

  if (key.startsWith("path:")) {
    const relNorm = key.slice("path:".length);
    return rows
      .filter((r) => r.relNorm === relNorm && r.sourceId !== keepSourceId)
      .map((r) => ({ fileId: r.id, sourceId: r.sourceId, relPath: r.relPath, size: r.size, hash: r.hash }));
  }

  if (key.startsWith("hash:")) {
    const hash = key.slice("hash:".length);
    return rows
      .filter((r) => r.hash === hash && r.sourceId !== keepSourceId)
      .map((r) => ({ fileId: r.id, sourceId: r.sourceId, relPath: r.relPath, size: r.size, hash: r.hash }));
  }

  throw new Error(`unrecognized group key: ${key}`);
}
