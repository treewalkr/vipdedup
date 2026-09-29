import { Elysia } from "elysia";
import type { OverviewDto } from "@vd/shared";
import { getDb } from "../db";
import { sources } from "../db/schema";
import { buildSourceStatuses } from "../lib/status";
import { computeOverlapSummary, loadFileRows } from "../lib/groups";

export const overviewRoutes = new Elysia({ prefix: "/v1", tags: ["overview"] }).get(
  "/overview",
  async (): Promise<OverviewDto> => {
    const { db } = getDb();
    const srcs = db.select().from(sources).orderBy(sources.id).all();
    const [sourceStatuses, rows] = await Promise.all([buildSourceStatuses(), loadFileRows()]);
    return {
      sources: sourceStatuses,
      overlap: computeOverlapSummary(rows, srcs.map((s) => ({ id: s.id }))),
    };
  },
  { detail: { summary: "Everything the dashboard needs in one call" } },
);
