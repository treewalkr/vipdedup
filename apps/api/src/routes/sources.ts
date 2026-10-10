import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { isSafeRelPath, normSeg } from "@vd/shared";
import { buildSourceStatuses } from "../lib/status";
import { startScan, isScanning, checkOnline } from "../scanner/manager";
import { getDb } from "../db";
import { files, scanRuns, sources } from "../db/schema";
import { loadFileRows, type FileRow } from "../lib/groups";
import type { FileEntryDto, FolderEntryDto } from "@vd/shared";

/** `a` equal/inside/containing `b`, with trailing slashes normalized away. */
const overlaps = (a: string, b: string) => {
  const da = a.endsWith("/") ? a : `${a}/`;
  const db = b.endsWith("/") ? b : `${b}/`;
  return da.startsWith(db) || db.startsWith(da);
};

export const sourceRoutes = new Elysia({ prefix: "/v1/sources", tags: ["sources"] })
  .get(
    "/",
    async () => ({ sources: await buildSourceStatuses() }),
    { detail: { summary: "List sources with availability and last scan" } },
  )
  .post(
    "/",
    async ({ body, status }) => {
      const p = body.path.trim();
      if (!p.startsWith("/")) return status(400, { error: "path must be absolute" });

      const { db } = getDb();
      const existing = db.select().from(sources).all();
      if (existing.some((s) => s.path === p))
        return status(409, { error: "a source with this path already exists" });
      const clash = existing.find((s) => overlaps(p, s.path));
      if (clash) return status(409, { error: `path overlaps existing source «${clash.label}»` });

      // stat() in a throwaway subprocess: a wedged FUSE mount must never hang this route
      const online = await checkOnline([{ id: -1, path: p }]);
      if (!online.get(-1))
        return status(400, { error: "path is not an accessible directory — mount the drive and try again" });

      const row = db
        .insert(sources)
        .values({ label: body.label, path: p, createdAt: new Date().toISOString() })
        .returning()
        .get();
      return { source: { id: row.id, label: row.label, path: row.path, createdAt: row.createdAt } };
    },
    {
      body: t.Object({
        label: t.String({ minLength: 1, maxLength: 100 }),
        path: t.String({ minLength: 1 }),
      }),
      detail: { summary: "Add a source location (validated: absolute, accessible, non-overlapping)" },
    },
  )
  .delete(
    "/:id",
    ({ params, status }) => {
      const { db, sqlite } = getDb();
      const row = db.select().from(sources).where(eq(sources.id, params.id)).get();
      if (!row) return status(404, { error: "unknown source" });
      if (isScanning(params.id)) return status(409, { error: "scan in progress for this source" });

      const { n } = sqlite
        .prepare("SELECT COUNT(*) AS n FROM trash_items WHERE source_id = ?")
        .get(params.id) as { n: number };
      if (n > 0)
        return status(409, {
          error: `source still has ${n} staged trash item(s) — restore or purge them on the Trash page first`,
        });

      // manual cascade (FKs aren't enforced) — metadata only, nothing on disk is touched
      db.delete(files).where(eq(files.sourceId, params.id)).run();
      db.delete(scanRuns).where(eq(scanRuns.sourceId, params.id)).run();
      db.delete(sources).where(eq(sources.id, params.id)).run();
      return { deleted: true, id: params.id };
    },
    {
      params: t.Object({ id: t.Number() }),
      detail: { summary: "Remove a source and its metadata (refused while staged trash exists)" },
    },
  )
  .post(
    "/:id/scan",
    ({ params, status }) => {
      const result = startScan(params.id);
      if (!result.started) return status(409, { error: result.reason });
      return { started: true, sourceId: params.id };
    },
    {
      params: t.Object({ id: t.Number() }),
      detail: { summary: "Trigger a scan of one source (async — poll /v1/overview)" },
    },
  )
  .get(
    "/:id/files",
    ({ params, query, status }) => {
      const dir = typeof query.dir === "string" ? query.dir : "";
      if (dir !== "" && !isSafeRelPath(dir)) return status(400, { error: "invalid dir" });

      const rows = loadFileRows();
      const mine = rows.filter((r) => r.sourceId === params.id);
      const dirNorm = normSeg(dir);

      const labelOf = new Map<number, string>();
      for (const r of rows) labelOf.set(r.sourceId, r.sourceLabel);
      const sourcesByRel = new Map<string, Set<number>>();
      for (const r of rows) {
        const set = sourcesByRel.get(r.relNorm) ?? new Set<number>();
        set.add(r.sourceId);
        sourcesByRel.set(r.relNorm, set);
      }
      // hash-based identity for files verified byte-identical under different paths
      const sourcesByHash = new Map<string, Set<number>>();
      for (const r of rows) {
        if (r.hash === null) continue;
        const set = sourcesByHash.get(r.hash) ?? new Set<number>();
        set.add(r.sourceId);
        sourcesByHash.set(r.hash, set);
      }
      const dupSourcesOf = (r: { relNorm: string; hash: string | null }): number[] => {
        const ids = new Set<number>(sourcesByRel.get(r.relNorm) ?? []);
        if (r.hash !== null) for (const id of sourcesByHash.get(r.hash) ?? []) ids.add(id);
        ids.delete(params.id);
        return [...ids];
      };

      const files: FileEntryDto[] = mine
        .filter((r) => normSeg(r.dir) === dirNorm)
        .map((r) => {
          const others = dupSourcesOf(r);
          return {
            id: r.id,
            relPath: r.relPath,
            name: r.name,
            size: r.size,
            mtime: r.mtime,
            hash: r.hash,
            dupCopies: others.length,
            dupInLabels: others.map((id) => labelOf.get(id) ?? String(id)),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      // subfolders directly under `dir` (aggregated from everything beneath them)
      const prefix = dirNorm === "" ? "" : `${dirNorm}/`;
      const depth = dir === "" ? 0 : dir.split("/").length;
      const folders = new Map<string, { display: string; rows: FileRow[] }>();
      for (const r of mine) {
        const d = normSeg(r.dir);
        if (!d.startsWith(prefix)) continue;
        if (d.slice(prefix.length) === "") continue; // this row is a file *in* dir
        const segNorm = d.slice(prefix.length).split("/")[0];
        const display = r.dir.split("/")[depth] ?? segNorm;
        const entry = folders.get(segNorm) ?? { display, rows: [] as FileRow[] };
        entry.rows.push(r);
        folders.set(segNorm, entry);
      }

      const folderDtos: FolderEntryDto[] = [...folders.entries()]
        .map(([segNorm, entry]) => {
          const relPath = dir === "" ? entry.display : `${dir}/${entry.display}`;
          const folderNorm = normSeg(relPath);
          const dupSources = new Set<number>();
          for (const r of rows) {
            if (r.sourceId === params.id) continue;
            if (dir === "" ? r.topNorm === segNorm : normSeg(r.dir) === folderNorm) {
              dupSources.add(r.sourceId);
            }
          }
          return {
            name: entry.display,
            relPath,
            fileCount: entry.rows.length,
            bytes: entry.rows.reduce((acc, r) => acc + r.size, 0),
            dupInLabels: [...dupSources].map((id) => labelOf.get(id) ?? String(id)),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      return { dir, folders: folderDtos, files };
    },
    {
      params: t.Object({ id: t.Number() }),
      query: t.Object({ dir: t.Optional(t.String()) }),
      detail: { summary: "Browse one source directory (folders + files, with dup hints)" },
    },
  );
