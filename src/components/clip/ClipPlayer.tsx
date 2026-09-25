"use client";

import { useEffect, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";

/**
 * Public clip player.
 *
 * - Seeks to the highlight start as soon as metadata is available.
 * - Autoplays the range and stops at `endTime` (replay restarts at the start).
 * - Listens for `window` "fathom:seek" (`detail: { time }`) so transcript lines
 *   (and anything else on the page) can move the playhead without a shared ref.
 * - Seeking outside the highlight range disables the auto-stop — the visitor is
 *   exploring the full recording; "Replay clip" re-arms it.
 */

export interface ClipLine {
  id: string;
  speaker: string;
  text: string;
  startTime: number;
  inRange: boolean;
}

export interface ClipPlayerProps {
  audioSrc: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
}

export default function ClipPlayer({ audioSrc, startTime, endTime, durationSeconds }: ClipPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initializedRef = useRef(false);
  const autoplayedRef = useRef(false);
  const autoStopRef = useRef(true);

  const [current, setCurrent] = useState(startTime);
  const [playing, setPlaying] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [muted, setMuted] = useState(false);
  const [stopArmed, setStopArmed] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const attemptPlay = () => {
      audio.play().then(
        () => setNeedsGesture(false),
        () => {
          // unmuted autoplay blocked → retry muted (allowed without a gesture)
          audio.muted = true;
          setMuted(true);
          audio.play().then(
            () => setNeedsGesture(false),
            () => {
              audio.muted = false;
              setMuted(false);
              setNeedsGesture(true);
            },
          );
        },
      );
    };

    const onLoaded = () => {
      if (!initializedRef.current) {
        initializedRef.current = true;
        try {
          audio.currentTime = startTime;
        } catch {
          /* ignore — Safari can throw before enough data is buffered */
        }
        setCurrent(startTime);
      }
      if (!autoplayedRef.current) {
        autoplayedRef.current = true;
        attemptPlay();
      }
    };
    const onTime = () => {
      const t = audio.currentTime;
      setCurrent(t);
      if (autoStopRef.current && t >= endTime - 0.05 && !audio.paused) {
        audio.pause();
        audio.currentTime = endTime;
        setCurrent(endTime);
        setNeedsGesture(false);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => setLoadError(true);
    const onSeekEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ time?: number }>).detail;
      const time = detail?.time;
      if (typeof time !== "number" || !Number.isFinite(time)) return;
      const clamped = Math.max(0, Math.min(time, durationSeconds));
      if (clamped < startTime - 0.25 || clamped > endTime + 0.25) {
        autoStopRef.current = false; // exploring outside the clip range
        setStopArmed(false);
      }
      audio.currentTime = clamped;
      setCurrent(clamped);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    window.addEventListener("fathom:seek", onSeekEvent);
    if (audio.readyState >= 1) onLoaded(); // metadata may have loaded pre-mount
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
      window.removeEventListener("fathom:seek", onSeekEvent);
    };
  }, [startTime, endTime, durationSeconds]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (audio.currentTime >= endTime - 0.05 || audio.ended) {
        autoStopRef.current = true;
        setStopArmed(true);
        audio.currentTime = startTime;
        setCurrent(startTime);
      }
      void audio.play().then(
        () => setNeedsGesture(false),
        () => setNeedsGesture(true),
      );
    } else {
      audio.pause();
    }
  }

  function replayClip() {
    const audio = audioRef.current;
    if (!audio) return;
    autoStopRef.current = true;
    setStopArmed(true);
    audio.currentTime = startTime;
    setCurrent(startTime);
    void audio.play().then(
      () => setNeedsGesture(false),
      () => setNeedsGesture(true),
    );
  }

  function scrubFromClientX(clientX: number, element: HTMLElement) {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
    const time = ratio * durationSeconds;
    if (time < startTime - 0.25 || time > endTime + 0.25) {
      autoStopRef.current = false;
      setStopArmed(false);
    }
    audio.currentTime = time;
    setCurrent(time);
  }

  const inRange = current >= startTime - 0.05 && current <= endTime + 0.05;
  const rangeDuration = Math.max(endTime - startTime, 0.5);
  const progress = Math.max(0, Math.min(current / Math.max(durationSeconds, 1), 1));
  const rangeLeft = (startTime / Math.max(durationSeconds, 1)) * 100;
  const rangeWidth = (rangeDuration / Math.max(durationSeconds, 1)) * 100;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950">
      <div className="flex items-center gap-3 px-4 pt-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play clip"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-400 text-black transition-colors hover:bg-teal-300"
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4 translate-x-[1px]" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5-11-6.5z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div
            role="slider"
            tabIndex={0}
            aria-label="Playhead"
            aria-valuemin={0}
            aria-valuemax={Math.round(durationSeconds)}
            aria-valuenow={Math.round(current)}
            aria-valuetext={formatTimestamp(current)}
            onClick={(e) => scrubFromClientX(e.clientX, e.currentTarget)}
            onKeyDown={(e) => {
              const audio = audioRef.current;
              if (!audio) return;
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const delta = e.key === "ArrowRight" ? 5 : -5;
                const time = Math.max(0, Math.min(audio.currentTime + delta, durationSeconds));
                if (time < startTime - 0.25 || time > endTime + 0.25) {
                  autoStopRef.current = false;
                  setStopArmed(false);
                }
                audio.currentTime = time;
                setCurrent(time);
              }
            }}
            className="group relative h-6 cursor-pointer"
          >
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-neutral-800" />
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-teal-400/25"
              style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }}
            />
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-teal-400"
              style={{ left: 0, width: `${progress * 100}%` }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-teal-300 bg-neutral-950"
              style={{ left: `${progress * 100}%` }}
            />
          </div>

          <div className="flex items-center justify-between pb-2 font-mono text-[11px] tabular-nums text-neutral-500">
            <span className={inRange ? "text-teal-300" : undefined}>{formatTimestamp(current)}</span>
            <span>
              clip ends at {formatTimestamp(endTime)} · {formatTimestamp(rangeDuration)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={replayClip}
          title="Replay clip from the start"
          className="hidden h-8 shrink-0 rounded border border-neutral-700 px-2.5 text-[11px] text-neutral-300 transition-colors hover:border-teal-400/50 hover:text-teal-200 sm:block"
        >
          ⟲ Replay clip
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-neutral-800/80 px-4 py-2 text-[11px] text-neutral-500">
        <span className="rounded border border-neutral-700 px-1.5 py-0.5 uppercase tracking-wide text-neutral-500">
          simulated recording
        </span>
        <span>silent audio stand-in — the playhead and every seek are real</span>
        {muted && (
          <button
            type="button"
            onClick={() => {
              const audio = audioRef.current;
              if (!audio) return;
              audio.muted = false;
              setMuted(false);
            }}
            className="rounded border border-neutral-700 px-1.5 py-0.5 text-neutral-400 transition-colors hover:border-neutral-500 hover:text-white"
          >
            autoplay started muted — tap for sound
          </button>
        )}
        {!stopArmed && (
          <span className="text-amber-400/90">
            exploring past the clip — ⟲ replay re-arms the auto-stop
          </span>
        )}
        {needsGesture && (
          <span className="text-amber-400/90">
            autoplay was blocked — press play
          </span>
        )}
        {loadError && <span className="text-red-400">audio could not be loaded</span>}
      </div>

      <audio ref={audioRef} src={audioSrc} preload="metadata" className="hidden" />
    </div>
  );
}
