import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { app } from "../src/app";
import { openDb, setDb } from "../src/db";
import { sources } from "../src/db/schema";
import { runScan } from "../src/scanner/scan";
import type { AnyGroupDto, OverviewDto } from "@vd/shared";

let root: string;
let deltaId: number;

async function getJson(p: string) {
  const res = await app.handle(new Request(`http://localhost${p}`));
  return { status: res.status, body: (await res.json()) as any };
}

async function postJson(p: string, body: unknown) {
  const res = await app.handle(
    new Request(`http://localhost${p}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as any };
}

async function deleteJson(p: string) {
  const res = await app.handle(new Request(`http://localhost${p}`, { method: "DELETE" }));
  return { status: res.status, body: (await res.json()) as any };
}

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "vipdedup-e2e-"));
  const A = path.join(root, "srcA");
  const B = path.join(root, "srcB");
  const C = path.join(root, "srcC");

  // collection "ubuzama": one.mp4 identical across A/B; two.jpg differs
  mkdirSync(path.join(A, "ubuzama"), { recursive: true });
  writeFileSync(path.join(A, "ubuzama", "one.mp4"), "content-one");
  writeFileSync(path.join(A, "ubuzama", "two.jpg"), "content-two-AA");
  writeFileSync(path.join(A, ".DS_Store"), "junk"); // must be ignored
  mkdirSync(path.join(B, "ubuzama"), { recursive: true });
  writeFileSync(path.join(B, "ubuzama", "one.mp4"), "content-one");
  writeFileSync(path.join(B, "ubuzama", "two.jpg"), "content-two-BBBB-differs");
  // loose file duplicated under a renamed folder on C (hash-group case)
  writeFileSync(path.join(B, "loose.mp4"), "loose-content");
  mkdirSync(path.join(C, "moved"), { recursive: true });
  writeFileSync(path.join(C, "moved", "loose.mp4"), "loose-content");
  writeFileSync(path.join(C, "unique.txt"), "only here");

  const handle = openDb(path.join(root, "test.db"));
  setDb(handle);
  const { db } = handle;
  db.insert(sources).values([
    { label: "Alpha", path: A, createdAt: new Date().toISOString() },
    { label: "Beta", path: B, createdAt: new Date().toISOString() },
    { label: "Gamma", path: C, createdAt: new Date().toISOString() },
  ]).run();
});

afterAll(() => {
  setDb(undefined);
  rmSync(root, { recursive: true, force: true });
});

test("scan snapshots all sources, ignoring junk files", async () => {
  const a = await runScan(1);
  const b = await runScan(2);
  const c = await runScan(3);
  expect(a.status).toBe("ok");
  expect(b.status).toBe("ok");
  expect(c.status).toBe("ok");
  expect(a.fileCount).toBe(2); // .DS_Store ignored
  expect(b.fileCount).toBe(3);
  expect(c.fileCount).toBe(2);
});

test("overview reports online sources and overlap summary", async () => {
  const { status, body } = await getJson("/v1/overview");
  expect(status).toBe(200);
  const ov = body as OverviewDto;
  expect(ov.sources).toHaveLength(3);
  expect(ov.sources.every((s) => s.online)).toBe(true);
  expect(ov.overlap.folderGroups).toBe(1); // ubuzama on Alpha + Beta
  expect(ov.overlap.fileGroups).toBe(3); // one.mp4 (identical), two.jpg (differ), loose hash group
  expect(ov.overlap.confirmedGroups).toBe(2);
  expect(ov.overlap.differingGroups).toBe(1);
});

test("folder groups reflect per-source counts and differing content", async () => {
  const { body } = await getJson("/v1/groups?type=folder");
  const groups = body.groups as AnyGroupDto[];
  expect(groups).toHaveLength(1);
  const g = groups[0] as Extract<AnyGroupDto, { kind: "folder" }>;
  expect(g.key).toBe("folder:ubuzama");
  expect(g.status).toBe("differ"); // two.jpg content differs
  expect(g.dupFileCount).toBe(2);
  const alpha = g.sources.find((s) => s.sourceId === 1)!;
  expect(alpha.fileCount).toBe(2);
  expect(alpha.matchedCount).toBe(2);
});

test("file groups include a cross-path hash group for the renamed duplicate", async () => {
  const { body } = await getJson("/v1/groups?type=file");
  const groups = body.groups as AnyGroupDto[];
  const one = groups.find((g) => g.key === "path:ubuzama/one.mp4");
  expect(one?.status).toBe("identical");
  const two = groups.find((g) => g.key === "path:ubuzama/two.jpg");
  expect(two?.status).toBe("differ");
  const hashGroup = groups.find((g) => g.key.startsWith("hash:"));
  expect(hashGroup).toBeDefined();
  expect(hashGroup!.status).toBe("identical");
  expect(hashGroup!.sources.map((s) => s.sourceId).sort()).toEqual([2, 3]);
});

test("source browse shows folders, dup pills and loose files", async () => {
  const { body } = await getJson("/v1/sources/2/files");
  expect(body.folders.map((f: any) => f.name)).toEqual(["ubuzama"]);
  expect(body.folders[0].dupInLabels).toEqual(["Alpha"]);
  expect(body.files).toHaveLength(1);
  expect(body.files[0].name).toBe("loose.mp4");
  expect(body.files[0].dupCopies).toBe(1);
  expect(body.files[0].dupInLabels).toEqual(["Gamma"]);
});

test("keep-one-source stages only the verified duplicate copy", async () => {
  const { status, body } = await postJson("/v1/groups/trash", { key: "folder:ubuzama", keepSourceId: 1 });
  expect(status).toBe(200);
  expect(body.trashed).toBe(1); // one.mp4 only; two.jpg differs → kept

  const B = path.join(root, "srcB");
  expect(existsSync(path.join(B, "ubuzama", "one.mp4"))).toBe(false);
  expect(existsSync(path.join(B, "ubuzama", "two.jpg"))).toBe(true);
  // staged inside the same volume
  const trashRoot = path.join(B, ".vipdedup-trash");
  expect(existsSync(trashRoot)).toBe(true);

  const { body: trashList } = await getJson("/v1/trash");
  expect(trashList.items).toHaveLength(1);
  expect(trashList.items[0].originalRelPath).toBe("ubuzama/one.mp4");
  expect(trashList.items[0].sourceLabel).toBe("Beta");
});

test("restore puts the file back where it was", async () => {
  const { body } = await getJson("/v1/trash");
  const id = body.items[0].id;
  const { status } = await postJson(`/v1/trash/${id}/restore`, {});
  expect(status).toBe(200);
  expect(existsSync(path.join(root, "srcB", "ubuzama", "one.mp4"))).toBe(true);

  const { body: after } = await getJson("/v1/trash");
  expect(after.items).toHaveLength(0);

  // and the duplicate is detected again
  const { body: groups } = await getJson("/v1/groups?type=file");
  expect((groups.groups as AnyGroupDto[]).some((g) => g.key === "path:ubuzama/one.mp4")).toBe(true);
});

test("hash-group keep stages the relocated copy; purge removes it for good", async () => {
  const { body } = await getJson("/v1/groups?type=file");
  const hashGroup = (body.groups as AnyGroupDto[]).find((g) => g.key.startsWith("hash:"))!;
  const { status, body: trashed } = await postJson("/v1/groups/trash", {
    key: hashGroup.key,
    keepSourceId: 2,
  });
  expect(status).toBe(200);
  expect(trashed.trashed).toBe(1);
  expect(existsSync(path.join(root, "srcC", "moved", "loose.mp4"))).toBe(false);
  expect(existsSync(path.join(root, "srcB", "loose.mp4"))).toBe(true);

  const { status: purgeStatus, body: purged } = await postJson("/v1/trash/purge-all", {});
  expect(purgeStatus).toBe(200);
  expect(purged.purged).toBe(1);
  expect(existsSync(path.join(root, "srcC", "moved", "loose.mp4"))).toBe(false);
  expect(existsSync(path.join(root, "srcC", ".vipdedup-trash"))).toBe(false); // swept
});

test("scan of a missing source errors instead of hanging", async () => {
  await expect(runScan(99)).rejects.toThrow("unknown source");
});

test("add source validates the path before inserting", async () => {
  const D = path.join(root, "srcD");
  mkdirSync(path.join(D, "ubuzama"), { recursive: true });
  writeFileSync(path.join(D, "ubuzama", "one.mp4"), "content-one");
  writeFileSync(path.join(D, "only-delta.txt"), "delta");

  const rel = await postJson("/v1/sources", { label: "Rel", path: "some/rel/path" });
  expect(rel.status).toBe(400);
  const missing = await postJson("/v1/sources", { label: "Missing", path: path.join(root, "nope") });
  expect(missing.status).toBe(400);
  const dup = await postJson("/v1/sources", { label: "Alpha again", path: path.join(root, "srcA") });
  expect(dup.status).toBe(409);
  const nested = await postJson("/v1/sources", { label: "Nested", path: path.join(root, "srcA", "ubuzama") });
  expect(nested.status).toBe(409);
  const parent = await postJson("/v1/sources", { label: "Root", path: root });
  expect(parent.status).toBe(409);

  const { status, body } = await postJson("/v1/sources", { label: "Delta", path: D });
  expect(status).toBe(200);
  expect(body.source.label).toBe("Delta");
  expect(body.source.path).toBe(D);
  deltaId = body.source.id;

  const { body: list } = await getJson("/v1/sources");
  expect(list.sources.map((s: any) => s.source.label)).toContain("Delta");
});

test("remove source drops its metadata everywhere, disk untouched", async () => {
  expect((await runScan(deltaId)).status).toBe("ok");

  const { body: before } = await getJson(`/v1/sources/${deltaId}/files`);
  expect(before.folders.map((f: any) => f.name)).toEqual(["ubuzama"]);

  const { body: groupsBefore } = await getJson("/v1/groups?type=file");
  const oneBefore = (groupsBefore.groups as AnyGroupDto[]).find((g) => g.key === "path:ubuzama/one.mp4")!;
  expect(oneBefore.sources.map((s) => s.sourceId)).toContain(deltaId);

  const { status, body } = await deleteJson(`/v1/sources/${deltaId}`);
  expect(status).toBe(200);
  expect(body.deleted).toBe(true);
  expect(await deleteJson(`/v1/sources/${deltaId}`)).toMatchObject({ status: 404 });

  const { body: after } = await getJson(`/v1/sources/${deltaId}/files`);
  expect(after.folders).toHaveLength(0);
  expect(after.files).toHaveLength(0);
  const { body: groupsAfter } = await getJson("/v1/groups?type=file");
  const oneAfter = (groupsAfter.groups as AnyGroupDto[]).find((g) => g.key === "path:ubuzama/one.mp4")!;
  expect(oneAfter.sources.map((s) => s.sourceId)).not.toContain(deltaId);

  // metadata only — the drive's files are untouched, and rescans refuse the id
  expect(existsSync(path.join(root, "srcD", "ubuzama", "one.mp4"))).toBe(true);
  await expect(runScan(deltaId)).rejects.toThrow("unknown source");
});

test("remove source is refused while staged trash exists", async () => {
  const { status } = await postJson("/v1/groups/trash", { key: "folder:ubuzama", keepSourceId: 1 });
  expect(status).toBe(200);

  const { status: del, body } = await deleteJson("/v1/sources/2");
  expect(del).toBe(409);
  expect(body.error).toMatch(/staged trash/);

  const { body: trashList } = await getJson("/v1/trash");
  expect(trashList.items).toHaveLength(1);
  expect(trashList.items[0].sourceLabel).toBe("Beta");

  await postJson(`/v1/trash/${trashList.items[0].id}/restore`, {});
});
