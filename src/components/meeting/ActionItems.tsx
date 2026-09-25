"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ActionItemRow {
  id: string;
  text: string;
  done: boolean;
  sortOrder: number;
}

type Status = "idle" | "saving" | "saved" | "error";

export default function ActionItems({
  meetingId,
  items: initialItems,
}: {
  meetingId: string;
  items: ActionItemRow[];
}) {
  const [items, setItems] = useState<ActionItemRow[]>(initialItems);
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const flash = useCallback((next: Status, ms: number) => {
    setStatus(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus("idle"), ms);
  }, []);

  const toggle = useCallback(
    async (id: string) => {
      const previous = items;
      const target = previous.find((item) => item.id === id);
      if (!target) return;
      const done = !target.done;

      setItems((list) => list.map((item) => (item.id === id ? { ...item, done } : item)));
      setStatus("saving");

      try {
        const res = await fetch(`/api/meetings/${meetingId}/action-items`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, done }),
        });
        if (!res.ok) throw new Error(`PATCH ${res.status}`);
        flash("saved", 2200);
      } catch {
        setItems(previous);
        flash("error", 3600);
      }
    },
    [items, meetingId, flash],
  );

  const doneCount = items.filter((item) => item.done).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-950/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">Action items</h2>
          <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] tabular-nums text-neutral-400">
            {doneCount}/{items.length} done
          </span>
        </div>
        <span
          aria-live="polite"
          className={`text-[11px] transition-opacity duration-300 ${
            status === "idle"
              ? "text-neutral-600 opacity-0"
              : status === "error"
                ? "text-rose-400 opacity-100"
                : status === "saving"
                  ? "text-neutral-400 opacity-100"
                  : "text-teal-300 opacity-100"
          }`}
        >
          {status === "saving" ? "Saving…" : status === "error" ? "Couldn’t save — reverted" : "Saved ✓"}
        </span>
      </header>

      <div className="h-px w-full bg-neutral-800">
        <div className="h-px bg-teal-400/70 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-neutral-500">No action items captured for this meeting.</p>
      ) : (
        <ul className="divide-y divide-neutral-800/70">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => toggle(item.id)}
                aria-pressed={item.done}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.025]"
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    item.done
                      ? "border-teal-400 bg-teal-400 text-neutral-950"
                      : "border-neutral-600 text-transparent hover:border-neutral-400"
                  }`}
                >
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 6.5 5 9l4.5-6" />
                  </svg>
                </span>
                <span
                  className={`text-[13px] leading-5 transition-colors ${
                    item.done ? "text-neutral-500 line-through" : "text-neutral-300"
                  }`}
                >
                  {item.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
