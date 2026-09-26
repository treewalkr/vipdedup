import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  path: text("path").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export const files = sqliteTable(
  "files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    /** Path relative to the source root, original case, "/"-separated. */
    relPath: text("rel_path").notNull(),
    /** normSeg(relPath) — matching key across sources. */
    relNorm: text("rel_norm").notNull(),
    name: text("name").notNull(),
    nameNorm: text("name_norm").notNull(),
    /** Relative directory, "" at the root. */
    dir: text("dir").notNull(),
    /** First directory segment, "" for loose top-level files. */
    top: text("top").notNull(),
    topNorm: text("top_norm").notNull(),
    size: integer("size").notNull(),
    mtime: text("mtime").notNull(),
    /** SHA-256 hex, filled lazily for duplicate candidates only. */
    hash: text("hash"),
    scannedAt: text("scanned_at").notNull(),
  },
  (t) => [
    index("files_source_idx").on(t.sourceId),
    index("files_rel_norm_idx").on(t.relNorm),
    index("files_name_size_idx").on(t.nameNorm, t.size),
    index("files_hash_idx").on(t.hash),
    index("files_top_norm_idx").on(t.topNorm),
  ],
);

export const scanRuns = sqliteTable(
  "scan_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    /** running | ok | error | timeout */
    status: text("status").notNull(),
    /** scan | hash | done — progress inside a running scan. */
    phase: text("phase"),
    error: text("error"),
    fileCount: integer("file_count"),
    hashedCount: integer("hashed_count"),
    bytes: integer("bytes"),
  },
  (t) => [index("scan_runs_source_idx").on(t.sourceId)],
);

export const trashItems = sqliteTable(
  "trash_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id").notNull(),
    originalRelPath: text("original_rel_path").notNull(),
    /** Current location under <source root>/.vipdedup-trash/… */
    stagedRelPath: text("staged_rel_path").notNull(),
    size: integer("size").notNull(),
    hash: text("hash"),
    trashedAt: text("trashed_at").notNull(),
  },
  (t) => [index("trash_source_idx").on(t.sourceId)],
);
