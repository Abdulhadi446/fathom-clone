"use client";

import HighlightBar, { type HighlightSelection } from "@/components/highlights/HighlightBar";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ActionItems, { type ActionItemRow } from "./ActionItems";
import { formatClock } from "./formatClock";
import ScrubBar from "./ScrubBar";
import SummaryPanel, { type TemplateSummary } from "./SummaryPanel";
import Transcript, { type Seg } from "./Transcript";
import { SPEAKER_PALETTE, buildSpeakerColorMap } from "./speakerColors";

export interface MeetingViewProps {
  meeting: {
    id: string;
    durationSeconds: number;
  };
  segments: Seg[];
  /** Participants in display order — drives the shared speaker colour map. */
  speakerOrder: string[];
  summaries: TemplateSummary[];
  actionItems: ActionItemRow[];
  /** Deep link from search: `/meetings/[id]?t=<seconds>` — seek on load, no autoplay. */
  initialTimeSeconds?: number | null;
}

const RATES = [1, 1.25, 1.5, 2, 0.75];

interface LineSelection extends HighlightSelection {
  from: number;
  to: number;
}

function activeIndexFor(segments: Seg[], time: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].startTime <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export default function MeetingView({
  meeting,
  segments,
  speakerOrder,
  summaries,
  actionItems,
  initialTimeSeconds,
}: MeetingViewProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeRef = useRef(0);
  const durationRef = useRef(meeting.durationSeconds);
  /** Seek issued before the audio metadata arrived — applied in onLoadedMetadata. */
  const pendingSeekRef = useRef<number | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(meeting.durationSeconds);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [audioStatus, setAudioStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [seekToken, setSeekToken] = useState(0);
  const [selection, setSelection] = useState<LineSelection | null>(null);
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  const audioFailed = audioStatus === "failed";

  const setTime = useCallback((time: number) => {
    const clamped = Math.max(0, time);
    timeRef.current = clamped;
    setCurrentTime(clamped);
  }, []);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // `preload="metadata"` can finish BEFORE React hydrates, so the synthetic
  // onLoadedMetadata/onError handlers never fire — reconcile the status here.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.error) {
      setAudioStatus("failed");
      return;
    }
    if (audio.readyState >= 1 && Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
      durationRef.current = audio.duration;
      const pending = pendingSeekRef.current;
      if (pending !== null) {
        try {
          audio.currentTime = pending;
        } catch {
          /* ignore */
        }
        pendingSeekRef.current = null;
      }
      setAudioStatus("ready");
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
  }, [rate]);

  const activeIndex = useMemo(() => activeIndexFor(segments, currentTime), [segments, currentTime]);

  const colorMap = useMemo(() => {
    const order = [...speakerOrder];
    for (const segment of segments) {
      if (!order.includes(segment.speaker)) order.push(segment.speaker);
    }
    return buildSpeakerColorMap(order);
  }, [speakerOrder, segments]);
  const colorFor = useCallback(
    (speaker: string) => colorMap.get(speaker) ?? SPEAKER_PALETTE[0],
    [colorMap],
  );

  const seekTo = useCallback(
    (time: number, options: { play?: boolean; token?: boolean } = {}) => {
      const clamped = Math.min(Math.max(0, time), durationRef.current);
      const audio = audioRef.current;
      setTime(clamped);
      if (!audioFailed && audio) {
        if (audio.readyState > 0) {
          try {
            audio.currentTime = clamped;
            pendingSeekRef.current = null;
          } catch {
            pendingSeekRef.current = clamped;
          }
        } else {
          pendingSeekRef.current = clamped;
        }
      }
      if (options.token !== false) setSeekToken((value) => value + 1);

      if (options.play) {
        if (audioFailed || !audio) {
          setPlaying(true);
        } else {
          setPlaying(true);
          audio.play().catch(() => setPlaying(false));
        }
      }
    },
    [audioFailed, setTime],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (audioFailed || !audio) {
      setPlaying((wasPlaying) => {
        if (!wasPlaying) {
          if (timeRef.current >= durationRef.current) setTime(0);
          setSeekToken((value) => value + 1);
        }
        return !wasPlaying;
      });
      return;
    }
    if (playing) {
      audio.pause();
      return;
    }
    if (audio.ended || audio.currentTime >= durationRef.current) {
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      setTime(0);
    }
    setPlaying(true);
    setSeekToken((value) => value + 1);
    audio.play().catch(() => setPlaying(false));
  }, [audioFailed, playing, setTime]);

  const skip = useCallback(
    (delta: number) => seekTo(timeRef.current + delta),
    [seekTo],
  );

  // Deep link `/meetings/[id]?t=<seconds>` (agent B search results): seek on
  // load and scroll the transcript to that line — never autoplay.
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    deepLinkApplied.current = true;
    if (typeof initialTimeSeconds === "number" && Number.isFinite(initialTimeSeconds) && initialTimeSeconds > 0) {
      seekTo(initialTimeSeconds);
    }
  }, [initialTimeSeconds, seekTo]);

  // Highlight "play from here": agent C fires BOTH the optional `onSeek` prop
  // and a `fathom:seek` window event — dedupe so we only seek once.
  const highlightSeekGuard = useRef({ time: -1, at: 0 });
  const highlightSeek = useCallback(
    (time: number) => {
      const now = Date.now();
      const guard = highlightSeekGuard.current;
      if (guard.time === time && now - guard.at < 600) return;
      highlightSeekGuard.current = { time, at: now };
      seekTo(time, { play: true });
    },
    [seekTo],
  );

  useEffect(() => {
    const onWindowSeek = (event: Event) => {
      const detail = (event as CustomEvent<{ time?: number }>).detail;
      if (detail && typeof detail.time === "number") highlightSeek(detail.time);
    };
    window.addEventListener("fathom:seek", onWindowSeek);
    return () => window.removeEventListener("fathom:seek", onWindowSeek);
  }, [highlightSeek]);

  // Virtual clock: keeps the timeline (and transcript sync) alive when the
  // audio file is missing or fails to load.
  useEffect(() => {
    if (!audioFailed || !playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = ((now - last) / 1000) * rate;
      last = now;
      const next = Math.min(timeRef.current + delta, durationRef.current);
      timeRef.current = next;
      setCurrentTime(next);
      if (next >= durationRef.current) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioFailed, playing, rate]);

  const handleLineClick = useCallback(
    (index: number, shift: boolean) => {
      const segment = segments[index];
      if (!segment) return;

      if (shift) {
        if (anchorIndex === null || anchorIndex === index) {
          setAnchorIndex(index);
          setSelection({
            start: segment.startTime,
            end: segment.endTime,
            text: segment.text,
            from: index,
            to: index,
          });
        } else {
          const from = Math.min(anchorIndex, index);
          const to = Math.max(anchorIndex, index);
          setSelection({
            start: segments[from].startTime,
            end: segments[to].endTime,
            text: segments
              .slice(from, to + 1)
              .map((line) => line.text)
              .join(" "),
            from,
            to,
          });
        }
        return;
      }

      setAnchorIndex(index);
      setSelection({
        start: segment.startTime,
        end: segment.endTime,
        text: segment.text,
        from: index,
        to: index,
      });
      seekTo(segment.startTime, { play: true });
    },
    [segments, anchorIndex, seekTo],
  );

  // Escape clears the transcript selection fed to the highlight tools.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelection(null);
        setAnchorIndex(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const highlightSelection: HighlightSelection | null = selection
    ? { start: selection.start, end: selection.end, text: selection.text }
    : null;
  const selectionRange: [number, number] | null = selection
    ? [selection.from, selection.to]
    : null;

  const cycleRate = () => {
    setRate((current) => RATES[(RATES.indexOf(current) + 1) % RATES.length]);
  };

  return (
    <div className="pb-16">
      {/* --- audio player ------------------------------------------------ */}
      <section className="mt-4 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800/70 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                playing ? "animate-pulse bg-teal-400" : "bg-neutral-600"
              }`}
            />
            <span className="truncate text-[11px] uppercase tracking-[0.14em] text-neutral-500">
              Recording · {audioStatus === "loading" ? "loading" : playing ? "playing" : "paused"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
              Simulated recording
            </span>
            {audioFailed ? (
              <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-300">
                Audio unavailable — virtual timeline
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-400 text-neutral-950 transition-transform hover:scale-105 active:scale-95"
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor">
                <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={() => skip(-10)}
            aria-label="Back 10 seconds"
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-700 text-neutral-400 transition-colors hover:border-neutral-500 hover:text-white sm:flex"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9l5 4" />
              <path d="M6 9h7a5 5 0 1 1 0 10H9" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => skip(10)}
            aria-label="Forward 10 seconds"
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-700 text-neutral-400 transition-colors hover:border-neutral-500 hover:text-white sm:flex"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m13 5 5 4-5 4" />
              <path d="M18 9h-7a5 5 0 1 0 0 10h4" />
            </svg>
          </button>

          <span className="shrink-0 font-mono text-[11px] tabular-nums text-neutral-300">
            {formatClock(currentTime)}
            <span className="px-1 text-neutral-600">/</span>
            <span className="text-neutral-500">{formatClock(duration)}</span>
          </span>

          <ScrubBar
            value={currentTime}
            max={duration}
            onScrub={(time) => seekTo(time, { token: false })}
            onScrubEnd={(time) => seekTo(time)}
          />

          <button
            type="button"
            onClick={cycleRate}
            aria-label={`Playback speed ${rate}x`}
            className="h-7 shrink-0 rounded-md border border-neutral-700 px-2 font-mono text-[11px] tabular-nums text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
          >
            {rate}x
          </button>
        </div>

        <audio
          ref={audioRef}
          src={`/audio/${meeting.id}.m4a`}
          preload="metadata"
          onLoadedMetadata={(event) => {
            const audio = event.currentTarget;
            const meta = audio.duration;
            if (Number.isFinite(meta) && meta > 0) setDuration(meta);
            const pending = pendingSeekRef.current;
            if (pending !== null) {
              try {
                audio.currentTime = pending;
              } catch {
                /* ignore */
              }
              pendingSeekRef.current = null;
            }
            setAudioStatus("ready");
          }}
          onError={() => {
            setAudioStatus("failed");
            setPlaying(false);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(event) => {
            if (!audioFailed) setTime(event.currentTarget.currentTime);
          }}
          className="hidden"
        />
      </section>

      {/* --- highlight tools (agent C contract) --------------------------- */}
      <div className="mt-3">
        <HighlightBar
          meetingId={meeting.id}
          durationSeconds={meeting.durationSeconds}
          currentTime={currentTime}
          selection={highlightSelection}
          onSeek={highlightSeek}
        />
      </div>

      {/* --- transcript | summary + action items -------------------------- */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Transcript
            segments={segments}
            activeIndex={activeIndex}
            selectionRange={selectionRange}
            seekToken={seekToken}
            onLineClick={handleLineClick}
            colorFor={colorFor}
          />
        </div>

        <div className="flex flex-col gap-4 lg:col-span-5">
          <Suspense
            fallback={<div className="h-48 animate-pulse rounded-xl border border-neutral-800 bg-neutral-900/40" />}
          >
            <SummaryPanel summaries={summaries} />
          </Suspense>
          <ActionItems meetingId={meeting.id} items={actionItems} />
        </div>
      </div>
    </div>
  );
}
