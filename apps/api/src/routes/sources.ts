import { Elysia, t } from "elysia";
import { isSafeRelPath, normSeg } from "@vd/shared";
import { buildSourceStatuses } from "../lib/status";
import { startScan } from "../scanner/manager";
import { loadFileRows, type FileRow } from "../lib/groups";
import type { FileEntryDto, FolderEntryDto } from "@vd/shared";

export const sourceRoutes = new Elysia({ prefix: "/v1/sources", tags: ["sources"] })
  .get(
    "/",
    async () => ({ sources: await buildSourceStatuses() }),
    { detail: { summary: "List sources with availability and last scan" } },
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
