import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime, formatDuration } from "@/lib/format";
import { getActionItems, getMeeting, getSegments, getSummaries } from "@/lib/queries";
import { TEMPLATES, templateLabel } from "@/lib/summarize";
import MeetingView from "@/components/meeting/MeetingView";
import { buildSpeakerColorMap, initials } from "@/components/meeting/speakerColors";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const meeting = getMeeting(id);
  // Throw here (not only in the page body) so the response ships a real 404
  // status instead of streaming a 200 first.
  if (!meeting) notFound();
  return {
    title: `${meeting.title} — Fathom`,
    description: `Transcript, AI summary and action items for ${meeting.title}.`,
  };
}

export default async function MeetingDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const meeting = getMeeting(id);
  if (!meeting) notFound();

  // Deep link from agent B's search results: /meetings/[id]?t=<seconds>
  const query = await searchParams;
  const rawT = Array.isArray(query.t) ? query.t[0] : query.t;
  const parsedT = rawT === undefined ? Number.NaN : Number(rawT);
  const initialTimeSeconds =
    Number.isFinite(parsedT) && parsedT > 0 ? Math.min(parsedT, meeting.durationSeconds) : null;

  const segments = getSegments(id);
  const summaryRows = getSummaries(id);
  const actionRows = getActionItems(id);

  const speakerOrder = [...meeting.participants];
  for (const segment of segments) {
    if (!speakerOrder.includes(segment.speaker)) speakerOrder.push(segment.speaker);
  }
  const colors = buildSpeakerColorMap(speakerOrder);

  const summaries = summaryRows.map((row) => {
    const template = TEMPLATES.find((t) => t.id === row.template);
    return {
      template: row.template,
      label: templateLabel(row.template),
      description: template?.description ?? "Meeting summary.",
      content: row.content,
      createdAtLabel: row.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }),
    };
  });

  const actionItems = actionRows.map((row) => ({
    id: row.id,
    text: row.text,
    done: row.done,
    sortOrder: row.sortOrder,
  }));

  const shown = meeting.participants.slice(0, 8);
  const overflow = meeting.participants.length - shown.length;

  return (
    <main className="pb-4 pt-6">
      {/* --- header ------------------------------------------------------- */}
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3 5 8l5 5" />
          </svg>
          All meetings
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate text-neutral-600">Meeting detail</span>
      </nav>

      <header className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{meeting.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-neutral-400">
            <span>{formatDateTime(meeting.startedAt)}</span>
            <span className="text-neutral-700">•</span>
            <span className="tabular-nums">{formatDuration(meeting.durationSeconds)}</span>
            <span className="text-neutral-700">•</span>
            <span>
              {segments.length} transcript line{segments.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
              {meeting.source === "demo" ? "Demo ingest" : "Recorded"}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="flex -space-x-2">
            {shown.map((name) => {
              const color = colors.get(name);
              return (
                <span
                  key={name}
                  title={name}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border border-[#0a0a0b] text-[11px] font-semibold ${color?.chip ?? "bg-neutral-800 text-neutral-300"}`}
                >
                  {initials(name)}
                </span>
              );
            })}
            {overflow > 0 ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#0a0a0b] bg-neutral-800 text-[11px] font-medium text-neutral-300">
                +{overflow}
              </span>
            ) : null}
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-600">Participants</p>
            <p className="text-xs tabular-nums text-neutral-400">{meeting.participants.length}</p>
          </div>
        </div>
      </header>

      <MeetingView
        meeting={{ id: meeting.id, durationSeconds: meeting.durationSeconds }}
        segments={segments.map((segment) => ({
          id: segment.id,
          speaker: segment.speaker,
          text: segment.text,
          startTime: segment.startTime,
          endTime: segment.endTime,
        }))}
        speakerOrder={speakerOrder}
        summaries={summaries}
        actionItems={actionItems}
        initialTimeSeconds={initialTimeSeconds}
      />
    </main>
  );
}
