import { asc, desc, eq, like } from "drizzle-orm";
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

/** All meetings, newest first, with a one-line summary snippet from the primary Summary row. */
export function listMeetings(): (typeof meetings.$inferSelect)[] {
  return db
    .select()
    .from(meetings)
    .orderBy(desc(meetings.startedAt))
    .all();
}

export function getMeeting(id: string) {
  return db.select().from(meetings).where(eq(meetings.id, id)).get();
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
export function listMeetingsWithSnippet(): MeetingWithSnippet[] {
  const all = listMeetings();
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
export function searchAll(query: string, limit = 60): SearchHit[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `%${escapeLike(q)}%`;
  const hits: SearchHit[] = [];

  const titleHits = db
    .select()
    .from(meetings)
    .where(like(meetings.title, pattern))
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

  const meetingById = new Map(listMeetings().map((m) => [m.id, m]));
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
