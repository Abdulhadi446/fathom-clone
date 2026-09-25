"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { relativeDay } from "@/lib/format";
import HighlightMatch from "./HighlightMatch";
import { KIND_META, type HitKind } from "./hits";

export interface SearchApiHit {
  kind: HitKind;
  meetingId: string;
  meetingTitle: string;
  startedAt: string;
  field: string;
  excerpt: string;
  segmentId?: string;
  startTime?: number;
  href: string;
}

const DEBOUNCE_MS = 300;

export default function SearchBox({
  initialQuery = "",
  size = "lg",
  autoFocus = false,
}: {
  initialQuery?: string;
  size?: "lg" | "sm";
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<SearchApiHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const trimmed = query.trim();

  useEffect(() => {
    const seq = ++seqRef.current;
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=30`)
        .then((r) => r.json())
        .then((data: { hits?: SearchApiHit[] }) => {
          if (seq !== seqRef.current) return;
          setHits(Array.isArray(data.hits) ? data.hits : []);
          setActive(0);
          setLoading(false);
        })
        .catch(() => {
          if (seq !== seqRef.current) return;
          setHits([]);
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [active, hits]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showPanel = open && trimmed.length >= 2;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && hits.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length > 0) {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      const target = hits[active] ?? hits[0];
      if (target) {
        e.preventDefault();
        setOpen(false);
        router.push(target.href);
      } else if (trimmed.length >= 2) {
        e.preventDefault();
        setOpen(false);
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const kindCounts = hits.reduce<Record<string, number>>((acc, h) => {
    acc[h.kind] = (acc[h.kind] ?? 0) + 1;
    return acc;
  }, {});

  let lastKind: HitKind | null = null;

  return (
    <div
      className="relative w-full"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="relative">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 ${
            size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"
          }`}
          aria-hidden
        >
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>

        <input
          ref={inputRef}
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search meetings, transcripts, summaries…"
          aria-label="Search meetings"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="search-results-listbox"
          aria-autocomplete="list"
          aria-activedescendant={
            showPanel && hits.length > 0 ? `search-hit-${Math.min(active, hits.length - 1)}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          className={`w-full rounded-xl border border-neutral-800 bg-neutral-950/80 text-neutral-100 placeholder:text-neutral-600 transition focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/25 ${
            size === "lg"
              ? "py-2.5 pl-9 pr-16 text-sm sm:pr-24"
              : "py-2 pl-8 pr-14 text-[13px]"
          }`}
        />

        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(false);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-500 hover:text-neutral-300"
          >
            <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden>
              <path
                d="m4 4 8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 sm:block">
            ⌘K
          </kbd>
        )}
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-neutral-800 bg-[#0d0d0f] shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between border-b border-neutral-800/80 px-3 py-2 text-[11px] uppercase tracking-wide text-neutral-500">
            <span>{loading ? "Searching…" : `${hits.length} result${hits.length === 1 ? "" : "s"}`}</span>
            <span className="normal-case tracking-normal text-neutral-600">↑↓ navigate · ↵ open</span>
          </div>

          <div
            ref={listRef}
            id="search-results-listbox"
            className="max-h-[60vh] overflow-y-auto p-1.5"
            role="listbox"
          >
            {hits.length === 0 && !loading && (
              <div className="px-3 py-6 text-center text-sm text-neutral-500">
                No matches for “{trimmed}”.
              </div>
            )}

            {hits.map((hit, i) => {
              const header = hit.kind !== lastKind ? hit.kind : null;
              lastKind = hit.kind;
              const isActive = i === active;
              return (
                <div key={`${hit.kind}-${hit.meetingId}-${hit.segmentId ?? i}-${i}`}>
                  {header && (
                    <div className="flex items-center gap-2 px-3 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                      <span className={`h-1.5 w-1.5 rounded-full ${KIND_META[header].dot}`} />
                      {KIND_META[header].label}
                      <span className="text-neutral-600">· {kindCounts[header]}</span>
                    </div>
                  )}
                  <Link
                    href={hit.href}
                    id={`search-hit-${i}`}
                    data-active={isActive}
                    onClick={() => setOpen(false)}
                    onMouseEnter={() => setActive(i)}
                    role="option"
                    aria-selected={isActive}
                    className={`flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors ${
                      isActive ? "bg-neutral-800/70" : "hover:bg-neutral-900"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-neutral-200">
                          {hit.meetingTitle}
                        </span>
                        <span className="hidden shrink-0 text-[10px] text-neutral-600 sm:inline">
                          {relativeDay(new Date(hit.startedAt))}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-neutral-500">
                        {hit.kind === "transcript" && (
                          <span className="text-neutral-400">
                            {hit.field}
                            {typeof hit.startTime === "number" ? " · " : ""}
                          </span>
                        )}
                        {hit.kind === "summary" && (
                          <span className="mr-1 text-neutral-400">{hit.field} ·</span>
                        )}
                        <HighlightMatch text={hit.excerpt} query={trimmed} />
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>

          {trimmed.length >= 2 && (
            <Link
              href={`/search?q=${encodeURIComponent(trimmed)}`}
              onClick={() => setOpen(false)}
              className="block border-t border-neutral-800/80 px-3 py-2 text-center text-xs text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
            >
              View all results for “{trimmed}”
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
