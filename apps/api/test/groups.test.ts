import { test, expect } from "bun:test";
import {
  computeFileGroups,
  computeFolderGroups,
  computeOverlapSummary,
  resolveGroupMembers,
  statusOfCopies,
  type FileRow,
} from "../src/lib/groups";

let seq = 0;

// plain factory
function mk(sourceId: number, sourceLabel: string, rel: string, size: number, hash: string | null): FileRow {
  const cut = rel.lastIndexOf("/");
  const dir = cut === -1 ? "" : rel.slice(0, cut);
  const name = cut === -1 ? rel : rel.slice(cut + 1);
  const top = dir === "" ? "" : dir.split("/")[0];
  return {
    id: ++seq,
    sourceId,
    sourceLabel,
    relPath: rel,
    relNorm: rel.toLowerCase(),
    name,
    nameNorm: name.toLowerCase(),
    dir,
    top,
    topNorm: top.toLowerCase(),
    size,
    mtime: "2026-01-01T00:00:00.000Z",
    hash,
  };
}

test("statusOfCopies classifies hash/size evidence", () => {
  expect(statusOfCopies([{ size: 5, hash: "aa" }, { size: 5, hash: "aa" }])).toBe("identical");
  expect(statusOfCopies([{ size: 5, hash: "aa" }, { size: 5, hash: "bb" }])).toBe("differ");
  expect(statusOfCopies([{ size: 5, hash: null }, { size: 5, hash: null }])).toBe("unverified");
  expect(statusOfCopies([{ size: 5, hash: "aa" }, { size: 5, hash: null }])).toBe("partial");
  expect(statusOfCopies([{ size: 5, hash: null }, { size: 9, hash: null }])).toBe("differ");
});

test("folder groups: identical collection across two sources", () => {
  const rows = [
    mk(1, "A", "ubuzama/one.mp4", 100, "h1"),
    mk(1, "A", "ubuzama/two.mp4", 200, "h2"),
    mk(2, "B", "UBUZAMA/one.mp4", 100, "h1"),
    mk(2, "B", "UBUZAMA/two.mp4", 200, "h2"),
    mk(1, "A", "solo/only.mp4", 50, "h3"),
  ];
  const groups = computeFolderGroups(rows);
  expect(groups).toHaveLength(1);
  const g = groups[0];
  expect(g.key).toBe("folder:ubuzama");
  expect(g.status).toBe("identical");
  expect(g.dupFileCount).toBe(2);
  expect(g.dupBytes).toBe(300);
  expect(g.sources.map((s) => s.label)).toEqual(["A", "B"]);
  expect(g.sources.every((s) => s.matchedCount === 2)).toBe(true);
});

test("folder groups: same name different content is flagged, not merged away", () => {
  const rows = [
    mk(1, "A", "x/a.mp4", 100, "h1"),
    mk(2, "B", "x/a.mp4", 100, "h2"),
  ];
  const groups = computeFolderGroups(rows);
  expect(groups[0].status).toBe("differ");
});

test("file groups: path match identical + hash match across renamed folder", () => {
  const rows = [
    mk(1, "A", "loose.mp4", 100, "hl"),
    mk(2, "B", "loose.mp4", 100, "hl"), // path group, identical
    mk(2, "B", "renamed/loose.mp4", 100, "hl"), // same bytes, different path
    mk(3, "C", "elsewhere/loose.mp4", 100, "hl"),
  ];
  const groups = computeFileGroups(rows);
  const path = groups.find((g) => g.key === "path:loose.mp4");
  expect(path).toBeDefined();
  expect(path!.status).toBe("identical");
  expect(path!.sources.map((s) => s.sourceId).sort()).toEqual([1, 2]);

  const byHash = groups.find((g) => g.key === `hash:hl`);
  expect(byHash).toBeDefined();
  expect(byHash!.matchBasis).toBe("hash");
  // B's path-matched copy is excluded from the hash group; renamed + C copies remain
  expect(byHash!.sources.map((s) => s.sourceId).sort()).toEqual([2, 3]);
});

test("resolveGroupMembers folder keep is conservative when content differs", () => {
  const rows = [
    mk(1, "A", "x/same.mp4", 100, "h1"),
    mk(1, "A", "x/diff.mp4", 100, "hA"),
    mk(2, "B", "x/same.mp4", 100, "h1"), // identical → trashable
    mk(2, "B", "x/diff.mp4", 100, "hB"), // differs → keep
    mk(2, "B", "x/extra.mp4", 70, null), // not in keep source → keep
    mk(2, "B", "x/unverified.mp4", 80, null), // in keep source? no — mk only A has? (see below)
  ];
  // give the unverified case a counterpart in A with same size but no hashes
  rows.push(mk(1, "A", "x/unverified.mp4", 80, null));

  const members = resolveGroupMembers(rows, "folder:x", 1);
  const paths = members.map((m) => m.relPath).sort();
  expect(paths).toEqual(["x/same.mp4", "x/unverified.mp4"]);
});

test("resolveGroupMembers path and hash keys", () => {
  const rows = [
    mk(1, "A", "p/f.mp4", 10, "h1"),
    mk(2, "B", "p/f.mp4", 10, "h1"),
    mk(3, "C", "q/f.mp4", 10, "h1"),
  ];
  const byPath = resolveGroupMembers(rows, "path:p/f.mp4", 1);
  expect(byPath.map((m) => m.sourceId)).toEqual([2]);

  const byHash = resolveGroupMembers(rows, "hash:h1", 1);
  expect(byHash.map((m) => m.sourceId).sort()).toEqual([2, 3]);
});

test("computeOverlapSummary aggregates counts, reclaimable and matrix", () => {
  const rows = [
    mk(1, "A", "c/a.mp4", 100, "h1"),
    mk(2, "B", "c/a.mp4", 100, "h1"),
    mk(2, "B", "loose.mp4", 50, "h2"),
    mk(3, "C", "moved/loose.mp4", 50, "h2"),
  ];
  const summary = computeOverlapSummary(rows, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  expect(summary.folderGroups).toBe(1);
  // path group c/a.mp4 + hash group h2
  expect(summary.fileGroups).toBe(2);
  expect(summary.confirmedGroups).toBe(2);
  expect(summary.reclaimableBytes).toBe(150);
  const ab = summary.matrix.find((m) => m.aId === 1 && m.bId === 2);
  expect(ab?.sharedFolders).toBe(1);
  expect(ab?.sharedFiles).toBe(1);
  expect(ab?.sharedBytes).toBe(100);
  const bc = summary.matrix.find((m) => m.aId === 2 && m.bId === 3);
  // different relPaths ("loose.mp4" vs "moved/loose.mp4") → no path-level overlap
  expect(bc?.sharedFiles).toBe(0);
  expect(bc?.sharedFolders).toBe(0);
});
