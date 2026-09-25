import Link from "next/link";
import type { MeetingWithSnippet, MeetingExtras } from "@/lib/queries";
import { formatDuration, relativeDay } from "@/lib/format";
import { avatarColor, initials, meetingType, parseParticipants } from "./hits";

export default function MeetingTable({
  rows,
  extras,
}: {
  rows: MeetingWithSnippet[];
  extras: Map<string, MeetingExtras>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800/80 bg-neutral-950/60">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-800/80 text-left text-[11px] uppercase tracking-wide text-neutral-500">
            <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Meeting</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Participants</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Duration</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Lines</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Clips</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const people = parseParticipants(m.participants);
            const type = meetingType(extras.get(m.id)?.templates ?? []);
            const ex = extras.get(m.id);
            return (
              <tr
                key={m.id}
                className="border-b border-neutral-800/50 transition-colors last:border-0 hover:bg-neutral-900/60"
              >
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <div className="text-[13px] text-neutral-300">{relativeDay(m.startedAt)}</div>
                  <div className="text-[11px] text-neutral-600">
                    {m.startedAt.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </td>
                <td className="max-w-[320px] px-4 py-3 align-top">
                  <Link
                    href={`/meetings/${m.id}`}
                    className="block truncate text-[13px] font-medium text-neutral-100 hover:text-white hover:underline hover:decoration-neutral-600"
                    title={m.title}
                  >
                    {m.title}
                  </Link>
                  <div className="mt-0.5 truncate text-xs text-neutral-600" title={m.snippet}>
                    {m.snippet}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="flex items-center gap-2" title={people.join(", ")}>
                    <span className="flex -space-x-1.5">
                      {people.slice(0, 3).map((p) => (
                        <span
                          key={p}
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold ring-2 ring-[#0a0a0b] ${avatarColor(p)}`}
                        >
                          {initials(p)}
                        </span>
                      ))}
                    </span>
                    <span className="text-xs tabular-nums text-neutral-500">
                      {people.length}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${type.className}`}
                  >
                    {type.label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right align-top text-[13px] tabular-nums text-neutral-400">
                  {formatDuration(m.durationSeconds)}
                </td>
                <td className="px-4 py-3 text-right align-top text-[13px] tabular-nums text-neutral-500">
                  {m.segmentCount}
                </td>
                <td className="px-4 py-3 text-right align-top text-[13px] tabular-nums text-neutral-500">
                  {m.highlightCount}
                </td>
                <td className="px-4 py-3 text-right align-top text-[13px] tabular-nums text-neutral-500">
                  {ex ? `${ex.openActionItemCount}/${ex.actionItemCount}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div className="px-4 py-10 text-center text-sm text-neutral-500">
          No meetings match this filter.
          <Link href="/meetings" className="ml-2 text-teal-300 hover:underline">
            Clear filters
          </Link>
        </div>
      )}

    </div>
  );
}
