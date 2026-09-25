import { randomUUID } from "crypto";

/**
 * Public clip slugs: 12 chars drawn from `crypto.randomUUID()` (hex), no extra deps.
 * The `share_slug` column is UNIQUE — retry a few times on the (astronomically
 * unlikely) collision.
 */
export function newShareSlug(attempts = 6): string {
  for (let i = 0; i < attempts; i++) {
    const slug = randomUUID().replace(/-/g, "").slice(0, 12);
    if (/^[0-9a-f]{12}$/.test(slug)) return slug;
  }
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

/** Serialized highlight as returned by the /api/highlights endpoints. */
export function serializeHighlight(row: {
  id: string;
  meetingId: string;
  startTime: number;
  endTime: number;
  note: string | null;
  shareSlug: string | null;
  isPublic: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    meetingId: row.meetingId,
    startTime: row.startTime,
    endTime: row.endTime,
    note: row.note,
    shareSlug: row.shareSlug,
    isPublic: row.isPublic,
    createdAt: row.createdAt.toISOString(),
  };
}
