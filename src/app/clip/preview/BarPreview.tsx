"use client";

import { useEffect, useState } from "react";
import HighlightBar, { type HighlightSelection } from "@/components/highlights/HighlightBar";

export default function BarPreview({ initialSelection = true }: { initialSelection?: boolean }) {
  const [time, setTime] = useState(742);
  const [withSelection, setWithSelection] = useState(initialSelection);
  const [lastSeek, setLastSeek] = useState<number | null>(null);
  const selection: HighlightSelection | null = withSelection
    ? { start: 742, end: 758, text: "Rachel names the real problem — notes never make it into the CRM. They just never get there, and everything after that is re-keying." }
    : null;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ time: number }>).detail;
      setLastSeek(detail.time);
    };
    window.addEventListener("fathom:seek", handler);
    return () => window.removeEventListener("fathom:seek", handler);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={withSelection}
            onChange={(e) => setWithSelection(e.target.checked)}
          />
          selection active
        </label>
        <button
          type="button"
          className="rounded border border-neutral-700 px-2 py-1"
          onClick={() => setTime((t) => Math.min(t + 17, 2700))}
        >
          simulate time → {Math.floor(time)}s
        </button>
        <span className="text-neutral-600">
          last fathom:seek = {lastSeek === null ? "—" : `${lastSeek}s`}
        </span>
      </div>
      <HighlightBar
        meetingId="m_acme_discovery"
        durationSeconds={2700}
        currentTime={time}
        selection={selection}
      />
    </div>
  );
}
