import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listMeetingExtras, listMeetingsWithSnippet, type MeetingWithSnippet } from "@/lib/queries";
import MeetingTable from "@/components/dashboard/MeetingTable";
import SearchBox from "@/components/dashboard/SearchBox";
import { parseParticipants } from "@/components/dashboard/hits";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "All meetings — Fathom",
};

type Sort = "newest" | "oldest" | "longest" | "people" | "title";

const SORTS: { key: Sort; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "longest", label: "Longest" },
  { key: "people", label: "People" },
  { key: "title", label: "Title" },
];

function applySort(rows: MeetingWithSnippet[], sort: Sort): MeetingWithSnippet[] {
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
        (a, b) => b.participants.length - a.participants.length || b.startedAt.getTime() - a.startedAt.getTime(),
      );
      break;
    case "title":
      out.sort((a, b) => a.title.localeCompare(b.title));
      break;
    default:
      out.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }
  return out;
}

function href(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && v !== "all") search.set(k, v);
  }
  const s = search.toString();
  return s ? `/meetings?${s}` : "/meetings";
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; person?: string }>;
}) {
  const { sort: rawSort, person } = await searchParams;
  const sort: Sort =
    rawSort === "oldest" ||
    rawSort === "longest" ||
    rawSort === "people" ||
    rawSort === "title"
      ? rawSort
      : "newest";
  const activePerson = (person ?? "").trim();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const extras = new Map(listMeetingExtras(user.id).map((e) => [e.meetingId, e]));
  let rows = listMeetingsWithSnippet(user.id);

  const counts = new Map<string, number>();
  for (const m of rows) {
    for (const p of parseParticipants(m.participants)) {
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  const people = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => ({ name, n }));

  if (activePerson) {
    rows = rows.filter((m) => parseParticipants(m.participants).includes(activePerson));
  }
  rows = applySort(rows, sort);

  const totalMinutes = rows.reduce((sum, m) => sum + m.durationSeconds, 0) / 60;

  return (
    <main className="flex flex-col gap-5 py-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">All meetings</h1>
            <p className="mt-1 text-sm text-neutral-500">
              {rows.length} meeting{rows.length === 1 ? "" : "s"}
              {activePerson ? ` with ${activePerson}` : ""} · {Math.round(totalMinutes)} min total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-950/60 p-1">
              {SORTS.map((s) => (
                <Link
                  key={s.key}
                  href={href({ sort: s.key === "newest" ? undefined : s.key, person: activePerson })}
                  className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                    sort === s.key ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
            <Link
              href="/"
              className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
            >
              Row view
            </Link>
          </div>
        </div>

        <div className="max-w-2xl">
          <SearchBox size="sm" />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-wide text-neutral-600">Filter</span>
          <Link
            href={href({ sort: sort === "newest" ? undefined : sort })}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              !activePerson
                ? "border-teal-500/40 bg-teal-500/10 text-teal-300"
                : "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
            }`}
          >
            Everyone
          </Link>
          {people.map((p) => (
            <Link
              key={p.name}
              href={href({ sort: sort === "newest" ? undefined : sort, person: p.name })}
              title={`${p.n} meeting${p.n === 1 ? "" : "s"}`}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                activePerson === p.name
                  ? "border-teal-500/40 bg-teal-500/10 text-teal-300"
                  : "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
              }`}
            >
              {p.name.split(" ")[0]}{" "}
              <span className="tabular-nums text-neutral-600">{p.n}</span>
            </Link>
          ))}
        </div>
      </header>

      <MeetingTable rows={rows} extras={extras} />
    </main>
  );
}
