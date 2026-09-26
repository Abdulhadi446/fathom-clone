import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// SQLite schema — mirrors SCHEMA.md. Owned by the lead; changes go through SCHEMA.md first.

export const users = sqliteTable("User", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  calendarProvider: text("calendar_provider"),
  calendarConnected: integer("calendar_connected", { mode: "boolean" })
    .notNull()
    .default(false),
  emailVerifiedAt: integer("email_verified_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const meetings = sqliteTable(
  "Meeting",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    participants: text("participants", { mode: "json" }).$type<string[]>().notNull(),
    source: text("source").notNull().default("recorded"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    audioPath: text("audio_path"),
    /** true when the stored file is a screen recording (video/webm), false for voice */
    hasVideo: integer("has_video", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("Meeting_started_at_idx").on(t.startedAt)],
);

export const transcriptSegments = sqliteTable(
  "TranscriptSegment",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    speaker: text("speaker").notNull(),
    startTime: real("start_time").notNull(),
    endTime: real("end_time").notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("TranscriptSegment_meeting_idx").on(t.meetingId, t.startTime)],
);

export const summaries = sqliteTable(
  "Summary",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    template: text("template").notNull(),
    content: text("content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("Summary_meeting_template_uq").on(t.meetingId, t.template)],
);

export const actionItems = sqliteTable(
  "ActionItem",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("ActionItem_meeting_idx").on(t.meetingId)],
);

export const highlights = sqliteTable(
  "Highlight",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    startTime: real("start_time").notNull(),
    endTime: real("end_time").notNull(),
    note: text("note"),
    shareSlug: text("share_slug").unique(),
    isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("Highlight_meeting_idx").on(t.meetingId)],
);

export const sessions = sqliteTable(
  "Session",
  {
    // PK is sha256(session token) — the raw token only ever lives in the cookie.
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("Session_user_idx").on(t.userId)],
);

/**
 * Single-use tokens for email verification and password reset. Only sha256(token)
 * is stored; the raw token only exists in the emailed link.
 */
export const authTokens = sqliteTable(
  "AuthToken",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "verify_email" | "reset_password"
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("AuthToken_user_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type AuthToken = typeof authTokens.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;
export type TranscriptSegment = typeof transcriptSegments.$inferSelect;
export type NewTranscriptSegment = typeof transcriptSegments.$inferInsert;
export type Summary = typeof summaries.$inferSelect;
export type NewSummary = typeof summaries.$inferInsert;
export type ActionItem = typeof actionItems.$inferSelect;
export type NewActionItem = typeof actionItems.$inferInsert;
export type Highlight = typeof highlights.$inferSelect;
export type NewHighlight = typeof highlights.$inferInsert;
