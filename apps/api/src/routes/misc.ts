import path from "node:path";
import { Elysia, t } from "elysia";
import { isSafeRelPath } from "@vd/shared";
import { getSourceRow } from "../db";

export const miscRoutes = new Elysia({ prefix: "/v1", tags: ["misc"] }).post(
  "/reveal",
  ({ body, status }) => {
    if (!isSafeRelPath(body.relPath)) return status(400, { error: "invalid relPath" });
    const source = getSourceRow(body.sourceId);
    if (!source) return status(404, { error: "source not found" });
    const abs = path.resolve(source.path, body.relPath);
    if (abs !== source.path && !abs.startsWith(`${source.path}${path.sep}`)) {
      return status(400, { error: "path escapes source root" });
    }
    Bun.spawn(["open", "-R", abs], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    return { ok: true };
  },
  {
    body: t.Object({ sourceId: t.Number(), relPath: t.String({ minLength: 1 }) }),
    detail: { summary: "Reveal a file in Finder" },
  },
);
