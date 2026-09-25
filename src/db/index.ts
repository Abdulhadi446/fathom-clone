import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export const DATABASE_PATH =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "fathom.db");

const DDL = `
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "calendar_provider" TEXT,
  "calendar_connected" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS "Meeting" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "started_at" INTEGER NOT NULL,
  "duration_seconds" INTEGER NOT NULL,
  "participants" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'recorded',
  "user_id" TEXT REFERENCES "User"("id") ON DELETE SET NULL
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
`;

function createDb(): BetterSQLite3Database<typeof schema> {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  const sqlite = new Database(DATABASE_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema });
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  return db;
}

export const db: BetterSQLite3Database<typeof schema> = createDb();

export * as schema from "./schema";
