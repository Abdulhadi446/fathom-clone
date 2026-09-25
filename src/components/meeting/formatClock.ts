import { formatTimestamp } from "@/lib/format";

/** MM:SS below one hour, H:MM:SS above (pads the minutes of formatTimestamp). */
export function formatClock(totalSeconds: number): string {
  const raw = formatTimestamp(totalSeconds);
  const parts = raw.split(":");
  if (parts.length === 2) {
    return `${parts[0].padStart(2, "0")}:${parts[1]}`;
  }
  return raw;
}
