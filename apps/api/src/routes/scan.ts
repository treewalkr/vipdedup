import { Elysia } from "elysia";
import { getDb } from "../db";
import { sources } from "../db/schema";
import { scanningSourceIds, startScan } from "../scanner/manager";

export const scanRoutes = new Elysia({ prefix: "/v1", tags: ["sources"] }).post(
  "/scan-all",
  () => {
    const { db } = getDb();
    const already = new Set(scanningSourceIds());
    const started: number[] = [];
    const skipped: number[] = [];
    for (const s of db.select().from(sources).orderBy(sources.id).all()) {
      if (already.has(s.id) || startScan(s.id).started) started.push(s.id);
      else skipped.push(s.id);
    }
    return { started, skipped };
  },
  { detail: { summary: "Trigger scans for every source not currently scanning" } },
);
