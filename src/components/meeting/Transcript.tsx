"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { formatClock } from "./formatClock";
import type { SpeakerColor } from "./speakerColors";

export interface Seg {
  id: string;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

const PAGE_SIZE = 80;

interface TranscriptProps {
  segments: Seg[];
  activeIndex: number;
  selectionRange: [number, number] | null;
  seekToken: number;
  onLineClick: (index: number, shift: boolean) => void;
  colorFor: (speaker: string) => SpeakerColor;
}

interface RowProps {
  seg: Seg;
  index: number;
  active: boolean;
  selected: boolean;
  color: SpeakerColor;
  onClick: (index: number, shift: boolean) => void;
}

const Row = memo(function Row({ seg, index, active, selected, color, onClick }: RowProps) {
  return (
    <div
      data-i={index}
      onClick={(event) => onClick(index, event.shiftKey)}
      className={`group relative cursor-pointer border-l-2 px-4 py-2.5 transition-colors ${
        active
          ? "border-teal-400 bg-teal-400/[0.07]"
          : selected
            ? "border-neutral-500 bg-white/[0.04]"
            : "border-transparent hover:bg-white/[0.025]"
      }`}
    >
      <div className="grid grid-cols-[3.25rem_1fr] gap-x-3">
        <span
          className={`pt-0.5 font-mono text-[11px] tabular-nums ${
            active ? "text-teal-300" : "text-neutral-500 group-hover:text-neutral-400"
          }`}
        >
          {formatClock(seg.startTime)}
        </span>
        <div className="min-w-0">
          <span className={`block truncate text-[11px] font-semibold uppercase tracking-wider ${color.text}`}>
            {seg.speaker}
          </span>
          <p className={`mt-1 text-[13px] leading-5 ${active ? "text-neutral-100" : "text-neutral-400"}`}>
            {seg.text}
          </p>
        </div>
      </div>
    </div>
  );
});

export default function Transcript({
  segments,
  activeIndex,
  selectionRange,
  seekToken,
  onLineClick,
  colorFor,
}: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const programmaticUntil = useRef(0);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const [autoScroll, setAutoScroll] = useState(true);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const total = segments.length;
  const speakerCount = new Set(segments.map((s) => s.speaker)).size;

  const scrollToIndex = useCallback((index: number, smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    const row = el.querySelector<HTMLElement>(`[data-i="${index}"]`);
    if (!row) return;
    const containerRect = el.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const delta = rowRect.top - containerRect.top - (el.clientHeight / 2 - rowRect.height / 2);
    if (Math.abs(delta) < 6) return;
    programmaticUntil.current = Date.now() + (smooth ? 900 : 250);
    el.scrollBy({ top: delta, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Keep the active row inside the rendered window (playback can reach line 80+).
  useEffect(() => {
    if (activeIndex >= visible - 6 && visible < total) {
      setVisible(Math.min(total, Math.max(visible + PAGE_SIZE, activeIndex + PAGE_SIZE)));
    }
  }, [activeIndex, visible, total]);

  // Playback advanced → follow it, unless the user scrolled away.
  useEffect(() => {
    if (activeIndex < 0 || !autoScroll) return;
    if (activeIndex >= visible) return; // re-runs once `visible` extends above
    scrollToIndex(activeIndex, true);
  }, [activeIndex, autoScroll, visible, scrollToIndex]);

  // A seek / explicit play always resumes auto-scroll and snaps to the line.
  useEffect(() => {
    if (seekToken === 0) return;
    setAutoScroll(true);
    const frame = requestAnimationFrame(() => scrollToIndex(activeIndexRef.current, false));
    return () => cancelAnimationFrame(frame);
  }, [seekToken, scrollToIndex]);

  const handleScroll = useCallback(() => {
    if (Date.now() < programmaticUntil.current) return;
    setAutoScroll(false);
  }, []);

  const jumpToActive = useCallback(() => {
    setAutoScroll(true);
    scrollToIndex(activeIndexRef.current, false);
  }, [scrollToIndex]);

  const handleClick = useCallback(
    (index: number, shift: boolean) => onLineClick(index, shift),
    [onLineClick],
  );

  const shown = segments.slice(0, visible);
  const remaining = total - visible;

  return (
    <section className="relative flex flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40 lg:sticky lg:top-[4.75rem]">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-950/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">Transcript</h2>
          <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] tabular-nums text-neutral-400">
            {total} lines
          </span>
        </div>
        <span className="text-[11px] text-neutral-500">
          {speakerCount} speaker{speakerCount === 1 ? "" : "s"} · click a line to play
        </span>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scroll-thin h-[58vh] overflow-y-auto overscroll-contain lg:h-[calc(100vh-15.5rem)]"
      >
        {shown.map((seg, index) => (
          <Row
            key={seg.id}
            seg={seg}
            index={index}
            active={index === activeIndex}
            selected={selectionRange !== null && index >= selectionRange[0] && index <= selectionRange[1]}
            color={colorFor(seg.speaker)}
            onClick={handleClick}
          />
        ))}

        {remaining > 0 ? (
          <div className="border-t border-neutral-800/70 p-3 text-center">
            <button
              type="button"
              onClick={() => setVisible((v) => Math.min(total, v + PAGE_SIZE))}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-800 hover:text-white"
            >
              Show {Math.min(PAGE_SIZE, remaining)} more lines ({visible} of {total})
            </button>
          </div>
        ) : null}
      </div>

      {!autoScroll && activeIndex >= 0 ? (
        <button
          type="button"
          onClick={jumpToActive}
          className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-teal-400/40 bg-neutral-950/95 px-3.5 py-1.5 text-[11px] font-medium text-teal-300 shadow-lg shadow-black/40 backdrop-blur transition-colors hover:bg-neutral-800"
        >
          ↓ Jump to current line
        </button>
      ) : null}
    </section>
  );
}
