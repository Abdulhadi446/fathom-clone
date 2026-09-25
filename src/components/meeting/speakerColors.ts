export interface SpeakerColor {
  key: string;
  text: string;
  chip: string;
  dot: string;
}

/** Deterministic speaker palette — same person keeps the same colour everywhere. */
export const SPEAKER_PALETTE: SpeakerColor[] = [
  { key: "teal", text: "text-teal-300", chip: "border-teal-400/25 bg-teal-400/10 text-teal-300", dot: "bg-teal-400" },
  { key: "sky", text: "text-sky-300", chip: "border-sky-400/25 bg-sky-400/10 text-sky-300", dot: "bg-sky-400" },
  { key: "amber", text: "text-amber-300", chip: "border-amber-400/25 bg-amber-400/10 text-amber-300", dot: "bg-amber-400" },
  { key: "violet", text: "text-violet-300", chip: "border-violet-400/25 bg-violet-400/10 text-violet-300", dot: "bg-violet-400" },
  { key: "rose", text: "text-rose-300", chip: "border-rose-400/25 bg-rose-400/10 text-rose-300", dot: "bg-rose-400" },
  { key: "lime", text: "text-lime-300", chip: "border-lime-400/25 bg-lime-400/10 text-lime-300", dot: "bg-lime-400" },
  { key: "fuchsia", text: "text-fuchsia-300", chip: "border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-300", dot: "bg-fuchsia-400" },
  { key: "orange", text: "text-orange-300", chip: "border-orange-400/25 bg-orange-400/10 text-orange-300", dot: "bg-orange-400" },
];

/** Maps each distinct speaker (in first-appearance order) to a palette slot. */
export function buildSpeakerColorMap(speakers: readonly string[]): Map<string, SpeakerColor> {
  const map = new Map<string, SpeakerColor>();
  let i = 0;
  for (const name of speakers) {
    if (!map.has(name)) map.set(name, SPEAKER_PALETTE[i++ % SPEAKER_PALETTE.length]);
  }
  return map;
}

/** First letter of first + last name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
