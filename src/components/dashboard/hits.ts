import type { SearchHit } from "@/lib/queries";

export type HitKind = SearchHit["kind"];

/** Where a search hit should navigate to. */
export function hitHref(hit: {
  meetingId: string;
  kind: HitKind;
  startTime?: number;
}): string {
  if (hit.kind === "transcript" && typeof hit.startTime === "number") {
    return `/meetings/${hit.meetingId}?t=${Math.floor(hit.startTime)}`;
  }
  return `/meetings/${hit.meetingId}`;
}

export const KIND_META: Record<HitKind, { label: string; badge: string; dot: string }> = {
  meeting: {
    label: "Meetings",
    badge: "border-teal-500/30 bg-teal-500/10 text-teal-300",
    dot: "bg-teal-400",
  },
  transcript: {
    label: "Transcript",
    badge: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    dot: "bg-sky-400",
  },
  summary: {
    label: "Summary",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
  },
};

/** Meeting-type badge inferred from which summary templates exist. */
export function meetingType(templates: string[]): { label: string; className: string } {
  if (templates.includes("sales-call"))
    return { label: "Sales", className: "border-sky-500/30 bg-sky-500/10 text-sky-300" };
  if (templates.includes("interview"))
    return { label: "Interview", className: "border-violet-500/30 bg-violet-500/10 text-violet-300" };
  if (templates.includes("standup"))
    return { label: "Standup", className: "border-teal-500/30 bg-teal-500/10 text-teal-300" };
  if (templates.includes("decisions"))
    return { label: "Planning", className: "border-amber-500/30 bg-amber-500/10 text-amber-300" };
  return { label: "Internal", className: "border-neutral-600/60 bg-neutral-800/60 text-neutral-300" };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-teal-500/20 text-teal-200",
  "bg-sky-500/20 text-sky-200",
  "bg-violet-500/20 text-violet-200",
  "bg-amber-500/20 text-amber-200",
  "bg-rose-500/20 text-rose-200",
  "bg-emerald-500/20 text-emerald-200",
  "bg-indigo-500/20 text-indigo-200",
  "bg-fuchsia-500/20 text-fuchsia-200",
];

/** Stable avatar colour per participant name. */
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function parseParticipants(json: string | string[]): string[] {
  if (Array.isArray(json)) return json.map(String);
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
