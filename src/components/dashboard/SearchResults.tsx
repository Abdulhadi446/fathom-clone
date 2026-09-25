import Link from "next/link";
import type { SearchHit } from "@/lib/queries";
import { formatDateTime, formatTimestamp, relativeDay } from "@/lib/format";
import HighlightMatch from "./HighlightMatch";
import { KIND_META, hitHref, type HitKind } from "./hits";

const ORDER: HitKind[] = ["meeting", "transcript", "summary"];
const SUGGESTIONS = ["roadmap", "blocker", "budget", "SSO", "renewal", "onboarding"];

export default function SearchResults({ query, hits }: { query: string; hits: SearchHit[] }) {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return (
      <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/60 px-5 py-8 text-center">
        <p className="text-sm text-neutral-400">
          Search titles, transcript lines and AI summaries across every meeting.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <Link
              key={s}
              href={`/search?q=${encodeURIComponent(s)}`}
              className="rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-xs text-neutral-400 transition hover:border-neutral-700 hover:text-neutral-200"
            >
              {s}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (hits.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/60 px-5 py-10 text-center">
        <p className="text-sm text-neutral-300">No matches for “{trimmed}”.</p>
        <p className="mt-1 text-xs text-neutral-500">
          Try a different term — or pick one of the suggestions above.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <Link
              key={s}
              href={`/search?q=${encodeURIComponent(s)}`}
              className="rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-xs text-neutral-400 transition hover:border-neutral-700 hover:text-neutral-200"
            >
              {s}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const groups = ORDER.map((kind) => ({
    kind,
    items: hits.filter((h) => h.kind === kind),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-neutral-500">
        {hits.length} result{hits.length === 1 ? "" : "s"} for{" "}
        <span className="text-neutral-300">“{trimmed}”</span> across {groups.length} source
        {groups.length === 1 ? "" : "s"}
      </p>

      {groups.map((group) => {
        const meta = KIND_META[group.kind];
        return (
          <section key={group.kind}>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
              <span className="text-neutral-600">· {group.items.length}</span>
            </div>

            <div className="flex flex-col gap-2">
              {group.items.map((hit, i) => (
                <Link
                  key={`${hit.kind}-${hit.meetingId}-${hit.segmentId ?? i}-${i}`}
                  href={hitHref(hit)}
                  className="group rounded-xl border border-neutral-800/80 bg-neutral-950/60 px-4 py-3 transition-colors hover:border-neutral-700 hover:bg-neutral-900/70"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-neutral-200 group-hover:text-white">
                      {hit.meetingTitle}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.badge}`}>
                      {hit.kind}
                    </span>
                    <span className="text-[11px] text-neutral-600">
                      {relativeDay(hit.startedAt)} · {formatDateTime(hit.startedAt)}
                    </span>
                    {hit.kind === "transcript" && typeof hit.startTime === "number" && (
                      <span className="ml-auto rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-teal-300">
                        {formatTimestamp(hit.startTime)}
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-neutral-500">
                    {hit.kind === "transcript" && (
                      <span className="text-neutral-400">{hit.field}: </span>
                    )}
                    {hit.kind === "summary" && (
                      <span className="text-neutral-400">{hit.field} summary: </span>
                    )}
                    <HighlightMatch text={hit.excerpt} query={trimmed} />
                  </p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
