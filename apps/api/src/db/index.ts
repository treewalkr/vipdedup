import path from "node:path";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { SOURCES } from "../config";

/** Repo-root-relative default so the API and scan workers always agree. */
export function getDbPath(): string {
  return process.env.VIPDEDUP_DB ?? path.resolve(import.meta.dir, "../../../vipdedup.db");
}

export type Db = BunSQLiteDatabase<typeof schema | Record<string, never>>;

export interface DbHandle {
  db: Db;
  sqlite: Database;
  /** Path this handle was opened from — passed to scan/trash workers. */
  dbPath: string;
}

const DDL = `
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  rel_path TEXT NOT NULL,
  rel_norm TEXT NOT NULL,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  dir TEXT NOT NULL,
  top TEXT NOT NULL,
  top_norm TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime TEXT NOT NULL,
  hash TEXT,
  scanned_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS files_source_idx ON files(source_id);
CREATE INDEX IF NOT EXISTS files_rel_norm_idx ON files(rel_norm);
CREATE INDEX IF NOT EXISTS files_name_size_idx ON files(name_norm, size);
CREATE INDEX IF NOT EXISTS files_hash_idx ON files(hash);
CREATE INDEX IF NOT EXISTS files_top_norm_idx ON files(top_norm);
CREATE TABLE IF NOT EXISTS scan_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  phase TEXT,
  error TEXT,
  file_count INTEGER,
  hashed_count INTEGER,
  bytes INTEGER
);
CREATE INDEX IF NOT EXISTS scan_runs_source_idx ON scan_runs(source_id);
CREATE TABLE IF NOT EXISTS trash_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  original_rel_path TEXT NOT NULL,
  staged_rel_path TEXT NOT NULL,
  size INTEGER NOT NULL,
  hash TEXT,
  trashed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trash_source_idx ON trash_items(source_id);
`;

export function openDb(dbPath: string): DbHandle {
  const sqlite = new Database(dbPath, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA busy_timeout = 5000;");
  sqlite.exec(DDL);
  return { db: drizzle(sqlite, { schema }), sqlite, dbPath };
}

/** Insert any configured source whose path isn't in the table yet. */
export function seedSources({ db }: DbHandle, list: { label: string; path: string }[] = SOURCES) {
  for (const s of list) {
    db.insert(schema.sources)
      .values({ label: s.label, path: s.path, createdAt: new Date().toISOString() })
      .onConflictDoNothing({ target: schema.sources.path })
      .run();
  }
}

let handle: DbHandle | undefined;

/** Process-wide singleton. Tests point VIPDEDUP_DB at a temp file before first use. */
export function getDb(): DbHandle {
  if (!handle) {
    handle = openDb(getDbPath());
    seedSources(handle);
  }
  return handle;
}

/** For tests: swap in an explicit handle. */
export function setDb(h: DbHandle | undefined) {
  handle = h;
}

export function getSourceRow(id: number) {
  const { db } = getDb();
  return db.select().from(schema.sources).where(eq(schema.sources.id, id)).get();
}
