import { and, asc, desc, eq, inArray, like } from "drizzle-orm";
import { db } from "../db";
import {
  actionItems,
  highlights,
  meetings,
  summaries,
  transcriptSegments,
} from "../db/schema";

export function snippetFor(content: string, max = 220): string {
  const plain = content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length <= max ? plain : `${plain.slice(0, max - 1).trimEnd()}…`;
}

/**
 * A user's meetings, newest first.
 * Every read in the app goes through here or `getOwnedMeeting` — meeting data
 * is never exposed without an owning account.
 */
export function listMeetings(userId: string): (typeof meetings.$inferSelect)[] {
  return db
    .select()
    .from(meetings)
    .where(eq(meetings.userId, userId))
    .orderBy(desc(meetings.startedAt))
    .all();
}

/** Unscoped lookup — only for paths that are public by design (`/clip/<slug>`). */
export function getMeeting(id: string) {
  return db.select().from(meetings).where(eq(meetings.id, id)).get();
}

/** Ownership-checked lookup: returns null unless the meeting belongs to `userId`. */
export function getOwnedMeeting(id: string, userId: string) {
  return db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, id), eq(meetings.userId, userId)))
    .get();
}

export function getSegments(meetingId: string) {
  return db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.meetingId, meetingId))
    .orderBy(asc(transcriptSegments.startTime))
    .all();
}

export function getSummaries(meetingId: string) {
  return db
    .select()
    .from(summaries)
    .where(eq(summaries.meetingId, meetingId))
    .orderBy(asc(summaries.createdAt))
    .all();
}

export function getActionItems(meetingId: string) {
  return db
    .select()
    .from(actionItems)
    .where(eq(actionItems.meetingId, meetingId))
    .orderBy(asc(actionItems.sortOrder), asc(actionItems.createdAt))
    .all();
}

export function getHighlights(meetingId: string) {
  return db
    .select()
    .from(highlights)
    .where(eq(highlights.meetingId, meetingId))
    .orderBy(asc(highlights.startTime))
    .all();
}

export function getHighlightBySlug(slug: string) {
  return db.select().from(highlights).where(eq(highlights.shareSlug, slug)).get();
}

export type MeetingRow = NonNullable<ReturnType<typeof getMeeting>>;

export interface MeetingWithSnippet extends MeetingRow {
  snippet: string;
  segmentCount: number;
  highlightCount: number;
}

/** Meetings with snippet + counts in a handful of queries (dashboard + search). */
export function listMeetingsWithSnippet(userId: string): MeetingWithSnippet[] {
  const all = listMeetings(userId);
  const summaryRows = db.select().from(summaries).all();
  const segmentCounts = db
    .select({ meetingId: transcriptSegments.meetingId, n: transcriptSegments.id })
    .from(transcriptSegments)
    .all();
  const highlightCounts = db.select().from(highlights).all();

  const byMeeting = new Map<string, string[]>();
  for (const s of summaryRows) {
    const list = byMeeting.get(s.meetingId) ?? [];
    list.push(s.content);
    byMeeting.set(s.meetingId, list);
  }
  const segCount = new Map<string, number>();
  for (const row of segmentCounts) segCount.set(row.meetingId, (segCount.get(row.meetingId) ?? 0) + 1);
  const hlCount = new Map<string, number>();
  for (const h of highlightCounts) hlCount.set(h.meetingId, (hlCount.get(h.meetingId) ?? 0) + 1);

  return all.map((m) => {
    const contents = byMeeting.get(m.id) ?? [];
    const preferred =
      contents.find((c) => c.length > 0) ?? "";
    return {
      ...m,
      snippet: snippetFor(preferred),
      segmentCount: segCount.get(m.id) ?? 0,
      highlightCount: hlCount.get(m.id) ?? 0,
    };
  });
}

export interface SearchHit {
  kind: "meeting" | "transcript" | "summary";
  meetingId: string;
  meetingTitle: string;
  startedAt: Date;
  field: string;
  excerpt: string;
  segmentId?: string;
  startTime?: number;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Cross-meeting search over titles, transcript text and summary content. */
export function searchAll(userId: string, query: string, limit = 60): SearchHit[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `%${escapeLike(q)}%`;
  const hits: SearchHit[] = [];

  const titleHits = db
    .select()
    .from(meetings)
    .where(and(eq(meetings.userId, userId), like(meetings.title, pattern)))
    .all();
  for (const m of titleHits) {
    hits.push({
      kind: "meeting",
      meetingId: m.id,
      meetingTitle: m.title,
      startedAt: m.startedAt,
      field: "title",
      excerpt: m.title,
    });
  }

  const transcriptHits = db
    .select()
    .from(transcriptSegments)
    .where(like(transcriptSegments.text, pattern))
    .orderBy(asc(transcriptSegments.startTime))
    .all();

  const meetingById = new Map(listMeetings(userId).map((m) => [m.id, m]));
  const grouped = new Map<string, typeof transcriptHits>();
  for (const hit of transcriptHits) {
    const list = grouped.get(hit.meetingId) ?? [];
    if (list.length < 6) list.push(hit);
    grouped.set(hit.meetingId, list);
  }
  for (const [meetingId, rows] of grouped) {
    const m = meetingById.get(meetingId);
    if (!m) continue;
    for (const row of rows) {
      hits.push({
        kind: "transcript",
        meetingId,
        meetingTitle: m.title,
        startedAt: m.startedAt,
        field: row.speaker,
        excerpt: excerptAround(row.text, q),
        segmentId: row.id,
        startTime: row.startTime,
      });
    }
  }

  const summaryHits = db.select().from(summaries).where(like(summaries.content, pattern)).all();
  for (const row of summaryHits) {
    const m = meetingById.get(row.meetingId);
    if (!m) continue;
    hits.push({
      kind: "summary",
      meetingId: row.meetingId,
      meetingTitle: m.title,
      startedAt: m.startedAt,
      field: row.template,
      excerpt: excerptAround(row.content, q),
    });
  }

  return hits.slice(0, limit);
}

function excerptAround(text: string, needle: string, radius = 90): string {
  const flat = text.replace(/\s+/g, " ");
  const idx = flat.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return flat.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(flat.length, idx + needle.length + radius);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/* ------------------------------------------------------------------ *
 * Dashboard helpers (appended by agent B — additive only)
 * ------------------------------------------------------------------ */

export interface DashboardStats {
  meetingCount: number;
  totalDurationSeconds: number;
  meetingsThisWeek: number;
  segmentCount: number;
  highlightCount: number;
  openActionItems: number;
}

/** Aggregate numbers for the dashboard stats strip. */
export function getDashboardStats(userId: string): DashboardStats {
  const all = listMeetings(userId);
  const ownedIds = all.map((m) => m.id);
  const weekAgo = Date.now() - 7 * 86_400_000;
  let totalDurationSeconds = 0;
  let meetingsThisWeek = 0;
  for (const m of all) {
    totalDurationSeconds += m.durationSeconds;
    if (m.startedAt.getTime() >= weekAgo) meetingsThisWeek += 1;
  }
  const segmentCount = ownedIds.length
    ? db
        .select({ id: transcriptSegments.id })
        .from(transcriptSegments)
        .where(inArray(transcriptSegments.meetingId, ownedIds))
        .all().length
    : 0;
  const highlightCount = ownedIds.length
    ? db.select({ id: highlights.id }).from(highlights).where(inArray(highlights.meetingId, ownedIds)).all().length
    : 0;
  const openActionItems = ownedIds.length
    ? db
        .select({ id: actionItems.id })
        .from(actionItems)
        .where(and(eq(actionItems.done, false), inArray(actionItems.meetingId, ownedIds)))
        .all().length
    : 0;
  return {
    meetingCount: all.length,
    totalDurationSeconds,
    meetingsThisWeek,
    segmentCount,
    highlightCount,
    openActionItems,
  };
}

export interface MeetingExtras {
  meetingId: string;
  templates: string[];
  actionItemCount: number;
  openActionItemCount: number;
}

/** Per-meeting summary templates + action-item counts (meeting-type badge + row meta). */
export function listMeetingExtras(userId: string): MeetingExtras[] {
  const owned = new Set(listMeetings(userId).map((m) => m.id));
  if (owned.size === 0) return [];
  const ownedIds = [...owned];
  const summaryRows = db.select().from(summaries).where(inArray(summaries.meetingId, ownedIds)).all();
  const itemRows = db.select().from(actionItems).where(inArray(actionItems.meetingId, ownedIds)).all();

  const templates = new Map<string, Set<string>>();
  for (const s of summaryRows) {
    const set = templates.get(s.meetingId) ?? new Set<string>();
    set.add(s.template);
    templates.set(s.meetingId, set);
  }
  const counts = new Map<string, { total: number; open: number }>();
  for (const a of itemRows) {
    const cur = counts.get(a.meetingId) ?? { total: 0, open: 0 };
    cur.total += 1;
    if (!a.done) cur.open += 1;
    counts.set(a.meetingId, cur);
  }

  const ids = new Set([...templates.keys(), ...counts.keys()]);
  return [...ids].map((meetingId) => {
    const c = counts.get(meetingId) ?? { total: 0, open: 0 };
    return {
      meetingId,
      templates: [...(templates.get(meetingId) ?? [])].sort(),
      actionItemCount: c.total,
      openActionItemCount: c.open,
    };
  });
}
