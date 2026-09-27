import { desc } from "drizzle-orm";
import type { ScanRunDto, SourceStatusDto } from "@vd/shared";
import { getDb } from "../db";
import { scanRuns, sources } from "../db/schema";
import { checkOnline, isScanning } from "../scanner/manager";

function toRunDto(row: typeof scanRuns.$inferSelect): ScanRunDto {
  return {
    id: row.id,
    sourceId: row.sourceId,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? null,
    status: row.status as ScanRunDto["status"],
    phase: (row.phase as ScanRunDto["phase"]) ?? null,
    error: row.error ?? null,
    fileCount: row.fileCount ?? null,
    hashedCount: row.hashedCount ?? null,
    bytes: row.bytes ?? null,
  };
}

/** Source list + live availability + last scan + DB aggregates. */
export async function buildSourceStatuses(): Promise<SourceStatusDto[]> {
  const { db, sqlite } = getDb();
  const srcs = db.select().from(sources).orderBy(sources.id).all();
  const online = await checkOnline(srcs.map((s) => ({ id: s.id, path: s.path })));

  const agg = new Map<number, { n: number; bytes: number }>();
  for (const row of sqlite
    .prepare("SELECT source_id, COUNT(*) AS n, SUM(size) AS bytes FROM files GROUP BY source_id")
    .all() as { source_id: number; n: number; bytes: number | null }[]) {
    agg.set(row.source_id, { n: row.n, bytes: row.bytes ?? 0 });
  }

  const lastRun = new Map<number, ScanRunDto>();
  for (const run of db.select().from(scanRuns).orderBy(desc(scanRuns.id)).all()) {
    if (!lastRun.has(run.sourceId)) lastRun.set(run.sourceId, toRunDto(run));
  }

  return srcs.map((s) => ({
    source: {
      id: s.id,
      label: s.label,
      path: s.path,
      createdAt: s.createdAt,
    },
    online: online.get(s.id) ?? false,
    fileCount: agg.get(s.id)?.n ?? 0,
    bytes: agg.get(s.id)?.bytes ?? 0,
    lastScan: lastRun.get(s.id) ?? null,
    scanning: isScanning(s.id),
  }));
}
