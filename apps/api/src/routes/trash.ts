import { Elysia, t } from "elysia";
import { listTrashItems } from "../trash/ops";
import { runTrashOp } from "../trash/manager";

/**
 * Trash routes — thin. Every fs-mutating action is delegated to the
 * watchdogged ops worker so a wedged mount can never freeze the API.
 */
export const trashRoutes = new Elysia({ prefix: "/v1/trash", tags: ["trash"] })
  .get(
    "/",
    () => ({
      items: listTrashItems().map((i) => ({
        id: i.id,
        sourceId: i.sourceId,
        sourceLabel: i.label,
        originalRelPath: i.originalRelPath,
        size: i.size,
        trashedAt: i.trashedAt,
      })),
    }),
    { detail: { summary: "Staged (reversible) deletions" } },
  )
  .post(
    "/:id/restore",
    async ({ params, status }) => {
      const result = await runTrashOp({ op: "restore", itemId: params.id });
      if (result.ok) return { restored: true, relPath: result.relPath };
      if (result.code === "not-found") return status(404, { error: result.error });
      if (result.code === "missing-staged") return status(410, { error: result.error });
      if (result.code === "occupied") return status(409, { error: result.error });
      if (result.code === "timeout") return status(504, { error: result.error });
      return status(500, { error: result.error ?? "restore failed" });
    },
    { params: t.Object({ id: t.Number() }), detail: { summary: "Move a staged file back to its original path" } },
  )
  .post(
    "/:id/purge",
    async ({ params, status }) => {
      const result = await runTrashOp({ op: "purge", itemId: params.id });
      if (result.ok) return { purged: true };
      if (result.code === "not-found") return status(404, { error: result.error });
      if (result.code === "timeout") return status(504, { error: result.error });
      return status(500, { error: result.error ?? "purge failed" });
    },
    { params: t.Object({ id: t.Number() }), detail: { summary: "Permanently delete one staged file" } },
  )
  .post(
    "/purge-all",
    async ({ status }) => {
      const result = await runTrashOp({ op: "purge-all" });
      if (result.ok) return { purged: result.purged, failures: result.failures };
      if (result.code === "timeout") return status(504, { error: result.error });
      return status(500, { error: result.error ?? "purge failed" });
    },
    { detail: { summary: "Permanently delete every staged file" } },
  );
