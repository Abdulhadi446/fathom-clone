import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export { DATABASE_PATH } from "../lib/db-path";
import { DATABASE_PATH } from "../lib/db-path";

const DDL = `
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "password_hash" TEXT,
  "calendar_provider" TEXT,
  "calendar_connected" INTEGER NOT NULL DEFAULT 0,
  "email_verified_at" INTEGER,
  "created_at" INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS "Meeting" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "started_at" INTEGER NOT NULL,
  "duration_seconds" INTEGER NOT NULL,
  "participants" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'recorded',
  "audio_path" TEXT,
  "has_video" INTEGER NOT NULL DEFAULT 0,
  "user_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "Meeting_started_at_idx" ON "Meeting" ("started_at");
CREATE TABLE IF NOT EXISTS "TranscriptSegment" (
  "id" TEXT PRIMARY KEY,
  "meeting_id" TEXT NOT NULL REFERENCES "Meeting"("id") ON DELETE CASCADE,
  "speaker" TEXT NOT NULL,
  "start_time" REAL NOT NULL,
  "end_time" REAL NOT NULL,
  "text" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "TranscriptSegment_meeting_idx" ON "TranscriptSegment" ("meeting_id", "start_time");
CREATE TABLE IF NOT EXISTS "Summary" (
  "id" TEXT PRIMARY KEY,
  "meeting_id" TEXT NOT NULL REFERENCES "Meeting"("id") ON DELETE CASCADE,
  "template" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Summary_meeting_template_uq" ON "Summary" ("meeting_id", "template");
CREATE TABLE IF NOT EXISTS "ActionItem" (
  "id" TEXT PRIMARY KEY,
  "meeting_id" TEXT NOT NULL REFERENCES "Meeting"("id") ON DELETE CASCADE,
  "text" TEXT NOT NULL,
  "done" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "ActionItem_meeting_idx" ON "ActionItem" ("meeting_id");
CREATE TABLE IF NOT EXISTS "Highlight" (
  "id" TEXT PRIMARY KEY,
  "meeting_id" TEXT NOT NULL REFERENCES "Meeting"("id") ON DELETE CASCADE,
  "start_time" REAL NOT NULL,
  "end_time" REAL NOT NULL,
  "note" TEXT,
  "share_slug" TEXT UNIQUE,
  "is_public" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "Highlight_meeting_idx" ON "Highlight" ("meeting_id");
CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "created_at" INTEGER NOT NULL,
  "expires_at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "Session_user_idx" ON "Session" ("user_id");
CREATE TABLE IF NOT EXISTS "AuthToken" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "created_at" INTEGER NOT NULL,
  "expires_at" INTEGER NOT NULL,
  "used_at" INTEGER
);
CREATE INDEX IF NOT EXISTS "AuthToken_user_idx" ON "AuthToken" ("user_id");
`;

// Column-level upgrades for databases created before a column existed.
// (CREATE TABLE IF NOT EXISTS never alters an existing table.)
const COLUMN_MIGRATIONS: { table: string; column: string; ddl: string }[] = [
  { table: "User", column: "password_hash", ddl: 'ALTER TABLE "User" ADD COLUMN "password_hash" TEXT' },
  { table: "User", column: "email_verified_at", ddl: 'ALTER TABLE "User" ADD COLUMN "email_verified_at" INTEGER' },
  { table: "Meeting", column: "audio_path", ddl: 'ALTER TABLE "Meeting" ADD COLUMN "audio_path" TEXT' },
  { table: "Meeting", column: "has_video", ddl: 'ALTER TABLE "Meeting" ADD COLUMN "has_video" INTEGER NOT NULL DEFAULT 0' },
];

function migrateColumns(sqlite: InstanceType<typeof Database>): void {
  const existing = new Map<string, Set<string>>();
  for (const row of sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
    name: string;
  }[]) {
    const cols = new Set(
      (sqlite.prepare(`PRAGMA table_info("${row.name}")`).all() as { name: string }[]).map((c) => c.name),
    );
    existing.set(row.name, cols);
  }
  for (const { table, column, ddl } of COLUMN_MIGRATIONS) {
    if (existing.has(table) && !existing.get(table)!.has(column)) sqlite.exec(ddl);
  }
}

function createDb(): BetterSQLite3Database<typeof schema> {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  const sqlite = new Database(DATABASE_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(DDL);
  migrateColumns(sqlite);
  return drizzle(sqlite, { schema });
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  return db;
}

export const db: BetterSQLite3Database<typeof schema> = createDb();

export * as schema from "./schema";
