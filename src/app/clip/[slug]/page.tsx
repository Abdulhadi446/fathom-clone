import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ClipPlayer, { type ClipLine } from "@/components/clip/ClipPlayer";
import ClipTranscript from "@/components/clip/ClipTranscript";
import CopyLinkButton from "@/components/clip/CopyLinkButton";
import { formatDate, formatDuration, formatTimestamp } from "@/lib/format";
import { getHighlightBySlug, getMeeting, getSegments } from "@/lib/queries";

export const dynamic = "force-dynamic";

const CONTEXT_BEFORE = 2;
const CONTEXT_AFTER = 2;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const highlight = getHighlightBySlug(slug);
  if (!highlight || !highlight.isPublic) {
    return { title: "Clip not found — Fathom" };
  }
  const meeting = getMeeting(highlight.meetingId);
  const note = highlight.note?.trim();
  const title = note || meeting?.title || "Shared meeting clip";
  const description = meeting
    ? `A shared highlight from “${meeting.title}” (${formatDate(meeting.startedAt)}, ${formatDuration(meeting.durationSeconds)}).`
    : "Shared meeting highlight.";
  return {
    title: `${title.slice(0, 120)} — Fathom clip`,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

export default async function ClipPage({ params }: PageProps) {
  const { slug } = await params;

  const highlight = getHighlightBySlug(slug);
  if (!highlight || !highlight.isPublic) notFound();

  const meeting = getMeeting(highlight.meetingId);
  if (!meeting) notFound();

  const segments = getSegments(meeting.id);
  const firstInRange = segments.findIndex((s) => s.endTime > highlight.startTime);
  const lastInRange = segments.reduce(
    (acc, s, i) => (s.startTime < highlight.endTime ? i : acc),
    -1,
  );

  // Lines covering the shared range; if the range sits in a transcript gap
  // (shared clips do), fall back to the closest conversation around it.
  const hasInRange = firstInRange >= 0 && lastInRange >= firstInRange;
  const contextBefore = hasInRange ? CONTEXT_BEFORE : 3;
  const contextAfter = hasInRange ? CONTEXT_AFTER : 4;
  const anchorStart = firstInRange >= 0 ? firstInRange : segments.length;
  const anchorEnd = hasInRange ? lastInRange : firstInRange - 1;
  const from =
    firstInRange < 0
      ? Math.max(segments.length - 5, 0) // range sits past the last line
      : Math.max(0, anchorStart - contextBefore);
  const to =
    firstInRange < 0
      ? segments.length - 1
      : Math.min(segments.length - 1, Math.max(anchorEnd + contextAfter, from));

  const lines: ClipLine[] = segments.slice(from, to + 1).map((s) => ({
    id: s.id,
    speaker: s.speaker,
    text: s.text,
    startTime: s.startTime,
    inRange: s.endTime > highlight.startTime && s.startTime < highlight.endTime,
  }));

  const clipDuration = Math.max(highlight.endTime - highlight.startTime, 0.5);
  const title = highlight.note?.trim() || meeting.title;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-8 sm:py-10">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-teal-300">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3" aria-hidden="true">
            <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
          </svg>
          Public clip
        </span>
        <CopyLinkButton slug={slug} />
      </div>

      <header className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          {meeting.title}
        </p>
        <h1 className="text-2xl font-semibold leading-snug tracking-tight text-white sm:text-[27px]">
          {title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <span>{formatDate(meeting.startedAt)}</span>
          <span className="text-neutral-700">·</span>
          <span>{formatDuration(meeting.durationSeconds)}</span>
          <span className="text-neutral-700">·</span>
          <span className="font-mono text-teal-300/90">
            {formatTimestamp(highlight.startTime)}–{formatTimestamp(highlight.endTime)}
          </span>
          <span className="text-neutral-700">·</span>
          <span>{formatDuration(clipDuration)} clip</span>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {meeting.participants.map((name) => (
            <span
              key={name}
              className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[11px] text-neutral-400"
            >
              {name}
            </span>
          ))}
        </div>
      </header>

      <ClipPlayer
        audioSrc={`/api/audio/${meeting.id}`}
        hasAudio={Boolean(meeting.audioPath)}
        startTime={highlight.startTime}
        endTime={highlight.endTime}
        durationSeconds={meeting.durationSeconds}
      />

      <section className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800/80 px-4 py-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Transcript
          </h2>
          <span className="text-[11px] text-neutral-600">
            {hasInRange
              ? "click a line to jump · highlighted lines are the shared range"
              : "no lines inside the window — closest conversation shown"}
          </span>
        </div>
        {lines.length > 0 ? (
          <ClipTranscript lines={lines} />
        ) : (
          <p className="px-4 py-6 text-sm text-neutral-500">
            No transcript lines are available for this range.
          </p>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-neutral-600">
        <span>Shared from Fathom · AI meeting notetaker</span>
        <span>recording shown as a simulated audio stand-in</span>
      </footer>
    </main>
  );
}
