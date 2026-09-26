import Link from "next/link";
import type { MeetingWithSnippet } from "@/lib/queries";
import type { MeetingExtras } from "@/lib/queries";
import { formatDateTime, formatDuration, relativeDay } from "@/lib/format";
import { avatarColor, initials, meetingType, parseParticipants } from "./hits";

const SEGMENTS_ICON = (
  <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden>
    <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const CLIP_ICON = (
  <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden>
    <path
      d="M6 3.5v9l6-4.5-6-4.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

const CHECK_ICON = (
  <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden>
    <path
      d="m3.5 8.5 3 3 6-7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function MeetingRow({
  meeting,
  extras,
}: {
  meeting: MeetingWithSnippet;
  extras?: MeetingExtras;
}) {
  const participants = parseParticipants(meeting.participants);
  const shown = participants.slice(0, 4);
  const overflow = participants.length - shown.length;
  const type = meetingType(extras?.templates ?? []);
  const day = relativeDay(meeting.startedAt);
  const time = meeting.startedAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="group grid grid-cols-1 gap-3 rounded-xl border border-neutral-800/80 bg-neutral-950/60 px-4 py-4 transition-colors hover:border-neutral-700 hover:bg-neutral-900/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400/70 sm:grid-cols-[132px_1fr] sm:gap-5"
    >
      <div className="flex items-center gap-2 sm:block">
        <time
          dateTime={meeting.startedAt.toISOString()}
          title={formatDateTime(meeting.startedAt)}
          className="block text-sm font-medium text-neutral-300"
        >
          {day}
        </time>
        <span className="block text-xs text-neutral-500 sm:mt-0.5">{time}</span>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-[15px] font-medium text-neutral-100 group-hover:text-white">
            {meeting.title}
          </h3>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${type.className}`}
          >
            {type.label}
          </span>
          {meeting.source === "transcript" && (
            <span className="shrink-0 rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
              imported
            </span>
          )}
        </div>

        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-neutral-500">
          {meeting.snippet || "No summary yet."}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-neutral-500">
          <span className="flex items-center gap-2" title={participants.join(", ")}>
            <span className="flex -space-x-1.5">
              {shown.map((p) => (
                <span
                  key={p}
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold ring-2 ring-[#0a0a0b] ${avatarColor(p)}`}
                >
                  {initials(p)}
                </span>
              ))}
            </span>
            <span className="truncate text-neutral-400">
              {overflow > 0
                ? `${shown[0].split(" ")[0]} +${participants.length - 1}`
                : participants.length <= 2
                  ? participants.map((p) => p.split(" ")[0]).join(", ")
                  : `${participants.length} participants`}
            </span>
          </span>

          <span className="hidden h-3 w-px bg-neutral-800 sm:block" />

          <span className="tabular-nums">{formatDuration(meeting.durationSeconds)}</span>

          <span className="flex items-center gap-1 tabular-nums">
            {SEGMENTS_ICON}
            {meeting.segmentCount} lines
          </span>

          {meeting.highlightCount > 0 && (
            <span className="flex items-center gap-1 tabular-nums">
              {CLIP_ICON}
              {meeting.highlightCount}
            </span>
          )}

          {(extras?.actionItemCount ?? 0) > 0 && (
            <span className="flex items-center gap-1 tabular-nums">
              {CHECK_ICON}
              {extras?.openActionItemCount ?? 0}/{extras?.actionItemCount ?? 0} actions
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
