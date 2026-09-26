import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  getDashboardStats,
  listMeetingExtras,
  listMeetingsWithSnippet,
} from "@/lib/queries";
import { formatDuration } from "@/lib/format";
import MeetingRow from "@/components/dashboard/MeetingRow";
import SearchBox from "@/components/dashboard/SearchBox";
import StatsStrip, { type Stat } from "@/components/dashboard/StatsStrip";
import { parseParticipants } from "@/components/dashboard/hits";

export const dynamic = "force-dynamic";

type Sort = "newest" | "oldest" | "longest" | "people";

const SORTS: { key: Sort; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "longest", label: "Longest" },
  { key: "people", label: "People" },
];

function sortHref(sort: Sort): string {
  return sort === "newest" ? "/" : `/?sort=${sort}`;
}

function applySort<T extends { startedAt: Date; durationSeconds: number; participants: string[] }>(
  rows: T[],
  sort: Sort,
): T[] {
  const out = [...rows];
  switch (sort) {
    case "oldest":
      out.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
      break;
    case "longest":
      out.sort((a, b) => b.durationSeconds - a.durationSeconds);
      break;
    case "people":
      out.sort(
        (a, b) =>
          parseParticipants(b.participants).length - parseParticipants(a.participants).length ||
          b.startedAt.getTime() - a.startedAt.getTime(),
      );
      break;
    default:
      out.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }
  return out;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: rawSort } = await searchParams;
  const sort: Sort =
    rawSort === "oldest" || rawSort === "longest" || rawSort === "people" ? rawSort : "newest";

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const meetings = applySort(listMeetingsWithSnippet(user.id), sort);
  const extras = new Map(listMeetingExtras(user.id).map((e) => [e.meetingId, e]));
  const stats = getDashboardStats(user.id);

  const statCards: Stat[] = [
    { label: "Meetings", value: String(stats.meetingCount), hint: "all time" },
    { label: "This week", value: String(stats.meetingsThisWeek), hint: "last 7 days" },
    { label: "Recorded", value: formatDuration(stats.totalDurationSeconds), hint: "total runtime" },
    { label: "Open actions", value: String(stats.openActionItems), hint: "across all meetings" },
    { label: "Highlights", value: String(stats.highlightCount), hint: "saved clips" },
  ];

  return (
    <main className="flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Meetings</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {stats.meetingCount} meetings · {stats.segmentCount} transcript lines ·{" "}
              {stats.openActionItems} open action items
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-950/60 p-1">
              {SORTS.map((s) => (
                <Link
                  key={s.key}
                  href={sortHref(s.key)}
                  className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                    sort === s.key
                      ? "bg-neutral-800 text-white"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
            <Link
              href="/meetings"
              className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
            >
              Table view
            </Link>
          </div>
        </div>

        <div className="max-w-2xl">
          <SearchBox />
        </div>
      </header>

      <StatsStrip stats={statCards} />

      <section className="flex flex-col gap-2" aria-label="All meetings">
        {meetings.map((m) => (
          <MeetingRow key={m.id} meeting={m} extras={extras.get(m.id)} />
        ))}
        {meetings.length === 0 && (
          <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/60 px-6 py-14 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-teal-400/10 text-lg text-teal-300 ring-1 ring-teal-400/30">
              F
            </div>
            <h2 className="mt-4 text-base font-semibold text-white">No meetings yet</h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-500">
              Record one in the browser, paste a transcript you already have, or drop in a
              .vtt / .srt file. Summaries, action items, search and shareable clips follow
              automatically.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link
                href="/ingest"
                className="rounded-md bg-teal-500 px-3.5 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400"
              >
                Add your first meeting
              </Link>
              <Link
                href="/calendar"
                className="rounded-md border border-neutral-700 px-3.5 py-2 text-sm text-neutral-300 hover:border-neutral-500"
              >
                Connect a calendar
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
