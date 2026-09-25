"use client";

import { formatTimestamp } from "@/lib/format";
import type { ClipLine } from "./ClipPlayer";

const SPEAKER_TONES = [
  "text-teal-300",
  "text-sky-300",
  "text-amber-300",
  "text-violet-300",
  "text-rose-300",
  "text-lime-300",
];

function toneFor(speaker: string): string {
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) hash = (hash * 31 + speaker.charCodeAt(i)) >>> 0;
  return SPEAKER_TONES[hash % SPEAKER_TONES.length];
}

/**
 * Transcript excerpt of the shared range. Each line is a button: clicking it
 * seeks the clip player via the `fathom:seek` window event (no shared ref needed).
 * Lines inside the highlight range are emphasised.
 */
export default function ClipTranscript({ lines }: { lines: ClipLine[] }) {
  function seek(time: number) {
    window.dispatchEvent(new CustomEvent("fathom:seek", { detail: { time } }));
  }

  return (
    <ul className="flex flex-col">
      {lines.map((line) => (
        <li key={line.id}>
          <button
            type="button"
            onClick={() => seek(line.startTime)}
            title={`Play from ${formatTimestamp(line.startTime)}`}
            className={`flex w-full items-start gap-3 px-4 py-2 text-left transition-colors hover:bg-neutral-900 ${
              line.inRange ? "bg-teal-400/[0.05]" : ""
            }`}
          >
            <span
              className={`w-11 shrink-0 pt-0.5 font-mono text-[10.5px] tabular-nums ${
                line.inRange ? "text-teal-400/80" : "text-neutral-600"
              }`}
            >
              {formatTimestamp(line.startTime)}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`mr-1.5 text-[11.5px] font-semibold ${toneFor(line.speaker)}`}
              >
                {line.speaker}
              </span>
              <span
                className={`text-[13px] leading-relaxed ${
                  line.inRange ? "text-neutral-100" : "text-neutral-400"
                }`}
              >
                {line.text}
              </span>
            </span>
            {line.inRange && (
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" aria-hidden="true" />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
