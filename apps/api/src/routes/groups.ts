import { Elysia, t } from "elysia";
import type { AnyGroupDto } from "@vd/shared";
import { computeFileGroups, computeFolderGroups, loadFileRows, resolveGroupMembers } from "../lib/groups";
import { runTrashOp } from "../trash/manager";

export const groupRoutes = new Elysia({ prefix: "/v1/groups", tags: ["groups"] })
  .get(
    "/",
    ({ query }) => {
      const rows = loadFileRows();
      let groups: AnyGroupDto[] =
        (query.type ?? "folder") === "file" ? computeFileGroups(rows) : computeFolderGroups(rows);
      const minBytes = Number(query.minBytes ?? 0);
      if (Number.isFinite(minBytes) && minBytes > 0) {
        groups = groups.filter((g) => g.dupBytes >= minBytes);
      }
      if (query.sources) {
        const ids = query.sources
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n));
        groups = groups.filter((g) => g.sources.some((s) => ids.includes(s.sourceId)));
      }
      if (query.status) {
        groups = groups.filter((g) => g.status === query.status);
      }
      return { groups };
    },
    {
      query: t.Object({
        type: t.Optional(t.Union([t.Literal("folder"), t.Literal("file")])),
        minBytes: t.Optional(t.String()),
        sources: t.Optional(t.String()),
        status: t.Optional(t.String()),
      }),
      detail: { summary: "Duplicate groups (folder-level or file-level) with filters" },
    },
  )
  .post(
    "/trash",
    async ({ body, status }) => {
      let members;
      try {
        members = resolveGroupMembers(loadFileRows(), body.key, body.keepSourceId);
      } catch (e) {
        return status(400, { error: e instanceof Error ? e.message : String(e) });
      }
      if (members.length === 0) return status(400, { error: "group resolves to nothing to trash" });

      const bySource = new Map<number, typeof members>();
      for (const m of members) {
        const list = bySource.get(m.sourceId);
        if (list) list.push(m);
        else bySource.set(m.sourceId, [m]);
      }
      let trashed = 0;
      let bytes = 0;
      const failures: { relPath: string; error: string }[] = [];
      for (const [sourceId, list] of bySource) {
        const result = await runTrashOp({
          op: "move",
          sourceId,
          rows: list.map((m) => ({ id: m.fileId, relPath: m.relPath, size: m.size, hash: m.hash })),
        });
        if (result.ok) {
          trashed += Number(result.moved ?? 0);
          bytes += Number(result.bytes ?? 0);
          const fails = (result.failures ?? []) as { relPath: string; error: string }[];
          failures.push(...fails);
        } else if (result.code === "timeout") {
          return status(504, { error: result.error, trashed, bytes, failures });
        } else {
          return status(500, { error: result.error ?? "trash operation failed", trashed, bytes, failures });
        }
      }
      return { trashed, bytes, failures };
    },
    {
      body: t.Object({
        key: t.String({ minLength: 1 }),
        keepSourceId: t.Number(),
      }),
      detail: {
        summary: "Stage all duplicate copies of a group (keeps the chosen source)",
        description:
          "Moves the non-kept copies into .vipdedup-trash/ on the same volume. Reversible via /v1/trash until purged.",
      },
    },
  );
