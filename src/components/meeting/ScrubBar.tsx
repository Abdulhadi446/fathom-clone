"use client";

import { useRef } from "react";

interface ScrubBarProps {
  value: number;
  max: number;
  onScrub: (time: number) => void;
  onScrubEnd: (time: number) => void;
}

/** Hand-rolled scrub bar: pointer drag + keyboard seeking, no dependencies. */
export default function ScrubBar({ value, max, onScrub, onScrubEnd }: ScrubBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  const posToTime = (clientX: number): number => {
    const el = trackRef.current;
    if (!el || max <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.min(max, Math.max(0, ratio * max));
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        draggingRef.current = true;
        onScrub(posToTime(event.clientX));
      }}
      onPointerMove={(event) => {
        if (!draggingRef.current) return;
        onScrub(posToTime(event.clientX));
      }}
      onPointerUp={(event) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        onScrubEnd(posToTime(event.clientX));
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 30 : 5;
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          onScrubEnd(Math.min(max, value + step));
        } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          onScrubEnd(Math.max(0, value - step));
        } else if (event.key === "Home") {
          event.preventDefault();
          onScrubEnd(0);
        } else if (event.key === "End") {
          event.preventDefault();
          onScrubEnd(max);
        }
      }}
      className="group relative h-1.5 w-full min-w-[80px] flex-1 cursor-pointer touch-none rounded-full bg-neutral-800"
    >
      <div className="absolute inset-y-0 left-0 rounded-full bg-teal-400" style={{ width: `${pct}%` }} />
      <div
        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow shadow-black/50 transition-transform group-hover:scale-125"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
