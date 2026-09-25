"use client";

/**
 * PROPS CONTRACT — foundation-issued, do not change the shape.
 *
 * Owner: agent C (sharing + highlights).
 * Consumer: agent A (meeting detail page), which renders this inside
 * `/meetings/[id]` and passes its playback + selection state.
 *
 * Agent A: render it like this —
 *
 *   <HighlightBar
 *     meetingId={meeting.id}
 *     durationSeconds={meeting.durationSeconds}
 *     currentTime={currentTime}                 // seconds from the <audio> element
 *     selection={selection}                     // null when nothing is selected
 *     onSeek={seek}                             // optional: your seek function
 *   />
 *
 * `selection` = { start, end, text } in seconds (from the transcript line the
 * user selected, or a range spanning several lines). Agent C implements saving,
 * the highlight list and share toggling inside this component; agent A only
 * supplies state.
 *
 * The `/api/highlights` endpoints are owned by agent C.
 *
 * ─── addendum (agent C, optional extensions — the four props above are fixed) ───
 *
 * - `onSeek?: (time: number) => void` — called when the user clicks play-from-here
 *   on a highlight. The component ALSO broadcasts the same intent on the window:
 *
 *     window.addEventListener("fathom:seek", (e) => {
 *       const time = (e as CustomEvent<{ time: number }>).detail.time;
 *       audio.currentTime = time;
 *     });
 *
 *   so a player can hook up seeking without importing anything from this
 *   worktree. Both are fired when `onSeek` is provided; the event always fires.
 * - Without a selection the bar still works: "Highlight from now" captures
 *   `currentTime → min(currentTime + 30s, durationSeconds)`.
 */

import { useEffect, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";

export interface HighlightSelection {
  start: number;
  end: number;
  text: string;
}

export interface HighlightBarProps {
  meetingId: string;
  durationSeconds: number;
  currentTime: number;
  selection: HighlightSelection | null;
  /** Optional: called with seconds when the user plays a highlight from its start. */
  onSeek?: (time: number) => void;
}

interface HighlightDto {
  id: string;
  meetingId: string;
  startTime: number;
  endTime: number;
  note: string | null;
  shareSlug: string | null;
  isPublic: boolean;
  createdAt: string;
}

const NOW_RANGE_SECONDS = 30;

function trimExcerpt(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + "…";
}

function Icon({ path, className = "h-3.5 w-3.5" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

const ICON_PLAY = "M8 5.5v13l11-6.5-11-6.5z";
const ICON_PEN = "M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z";
const ICON_TRASH = "M3 6h18 M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6";
const ICON_LINK = "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71";
const ICON_GLOBE = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3.6 9h16.8 M3.6 15h16.8 M12 3a15 15 0 0 1 0 18 M12 3a15 15 0 0 0 0 18";
const ICON_CHECK = "M20 6 9 17l-5-5";
const ICON_PLUS = "M12 5v14 M5 12h14";

function IconBtn({
  label,
  path,
  onClick,
  tone = "neutral",
  disabled,
}: {
  label: string;
  path: string;
  onClick: () => void;
  tone?: "neutral" | "teal" | "red";
  disabled?: boolean;
}) {
  const tones =
    tone === "teal"
      ? "text-teal-300/80 hover:text-teal-200 hover:bg-teal-400/10"
      : tone === "red"
        ? "text-neutral-500 hover:text-red-400 hover:bg-red-400/10"
        : "text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors disabled:opacity-40 ${tones}`}
    >
      <Icon path={path} />
    </button>
  );
}

export default function HighlightBar({
  meetingId,
  durationSeconds,
  currentTime,
  selection,
  onSeek,
}: HighlightBarProps) {
  const [highlights, setHighlights] = useState<HighlightDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingFromNow, setPendingFromNow] = useState<{ start: number; end: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [reqBusy, setReqBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectionKey = selection ? `${selection.start}|${selection.end}|${selection.text}` : "";

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/highlights?meetingId=${encodeURIComponent(meetingId)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { highlights: HighlightDto[] };
        if (alive) {
          setHighlights(data.highlights);
          setError(null);
        }
      } catch {
        if (alive) {
          setError("Could not load highlights.");
          setHighlights((prev) => prev ?? []);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [meetingId]);

  const activeRange = selection
    ? { start: selection.start, end: Math.max(selection.end, selection.start + 0.5) }
    : pendingFromNow;
  const composerKey = selection ? `sel:${selectionKey}` : pendingFromNow ? `now:${pendingFromNow.start}` : "";
  const defaultNote = selection ? trimExcerpt(selection.text) : "";
  const noteValue = draftKey === composerKey ? draft : defaultNote;

  function setNote(value: string) {
    setDraft(value);
    setDraftKey(composerKey);
  }

  function seek(time: number) {
    onSeek?.(time);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fathom:seek", { detail: { time } }));
    }
  }

  async function send(path: string, init: RequestInit): Promise<HighlightDto | null> {
    setReqBusy(true);
    try {
      const res = await fetch(path, { ...init, headers: { "content-type": "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `request failed (${res.status})`);
      return (data as { highlight: HighlightDto }).highlight;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
      return null;
    } finally {
      setReqBusy(false);
    }
  }

  async function saveHighlight() {
    if (!activeRange || saving) return;
    setSaving(true);
    const body = JSON.stringify({
      meetingId,
      startTime: activeRange.start,
      endTime: activeRange.end,
      note: noteValue.trim() || undefined,
    });
    const created = await send("/api/highlights", { method: "POST", body });
    if (created) {
      setHighlights((prev) => [...(prev ?? []), created].sort((a, b) => a.startTime - b.startTime));
      setDraft("");
      setDraftKey(null);
      setPendingFromNow(null);
      setError(null);
    }
    setSaving(false);
  }

  function startFromNow() {
    const start = Math.max(0, Math.min(Math.floor(currentTime), Math.max(durationSeconds - 1, 0)));
    const end = Math.min(start + NOW_RANGE_SECONDS, durationSeconds);
    setPendingFromNow({ start, end: end > start ? end : start + 0.5 });
    setDraft("");
    setDraftKey(null);
  }

  function updateLocal(id: string, patch: Partial<HighlightDto>) {
    setHighlights((prev) => (prev ?? []).map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }

  async function saveNote(id: string, note: string) {
    const updated = await send(`/api/highlights/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ note: note.trim() || null }),
    });
    if (updated) {
      updateLocal(id, updated);
      setEditingId(null);
      setError(null);
    }
  }

  async function toggleShare(h: HighlightDto) {
    const updated = await send(`/api/highlights/${h.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isPublic: !h.isPublic }),
    });
    if (updated) {
      updateLocal(h.id, updated);
      setError(null);
    }
  }

  async function removeHighlight(id: string) {
    const previous = highlights ?? [];
    setHighlights(previous.filter((h) => h.id !== id));
    setConfirmId(null);
    try {
      const res = await fetch(`/api/highlights/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`delete failed (${res.status})`);
      setError(null);
    } catch {
      setError("Delete failed — the highlight was restored.");
      setHighlights(previous);
    }
  }

  async function copyLink(h: HighlightDto) {
    if (!h.shareSlug) return;
    const url = `${window.location.origin}/clip/${h.shareSlug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopiedId(h.id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 1600);
  }

  const count = highlights?.length ?? 0;
  const busy = saving || reqBusy;

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950/60" aria-label="Highlights">
      <header className="flex items-center gap-2 px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Highlights
        </h2>
        {highlights && <span className="text-[11px] text-neutral-600">{count}</span>}
        <div className="ml-auto flex items-center gap-2">
          {!selection && (
            <button
              type="button"
              onClick={startFromNow}
              className="flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300 transition-colors hover:border-teal-400/50 hover:text-teal-200"
            >
              <Icon path={ICON_PLUS} className="h-3 w-3" />
              Highlight from now
              <span className="font-mono text-neutral-500">{formatTimestamp(currentTime)}</span>
            </button>
          )}
          {selection && (
            <span className="hidden text-[11px] text-neutral-600 sm:inline">
              selection · {formatTimestamp(selection.start)}–{formatTimestamp(selection.end)}
            </span>
          )}
        </div>
      </header>

      {activeRange && (
        <div className="border-t border-neutral-800/80 bg-neutral-900/40 px-3 py-2.5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-teal-400/10 px-1.5 py-0.5 font-mono text-[11px] text-teal-300">
              {formatTimestamp(activeRange.start)}–{formatTimestamp(activeRange.end)}
            </span>
            <span className="text-[11px] text-neutral-500">
              {selection ? "from selection" : `from ${formatTimestamp(currentTime)} · ${NOW_RANGE_SECONDS}s cap`}
            </span>
            {!selection && (
              <button
                type="button"
                onClick={() => setPendingFromNow(null)}
                className="ml-auto text-[11px] text-neutral-500 hover:text-neutral-300"
              >
                Cancel
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={noteValue}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveHighlight();
              }}
              placeholder={
                selection ? "Note (defaults to the selected text)" : "Note (defaults to the transcript excerpt)"
              }
              maxLength={500}
              className="h-7 min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-teal-400/60"
            />
            <button
              type="button"
              onClick={() => void saveHighlight()}
              disabled={busy}
              className="h-7 shrink-0 rounded bg-teal-400 px-2.5 text-xs font-semibold text-black transition-opacity hover:bg-teal-300 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save highlight"}
            </button>
          </div>
        </div>
      )}

      <ul className="scroll-thin max-h-64 overflow-y-auto">
        {highlights === null && (
          <li className="border-t border-neutral-800/70 px-3 py-3 text-[11px] text-neutral-600">
            Loading highlights…
          </li>
        )}
        {highlights?.length === 0 && (
          <li className="border-t border-neutral-800/70 px-3 py-3 text-[11px] text-neutral-600">
            No highlights yet — select transcript text, or use “Highlight from now”.
          </li>
        )}
        {highlights?.map((h) => {
          const editing = editingId === h.id;
          return (
            <li key={h.id} className="flex items-center gap-2 border-t border-neutral-800/70 px-3 py-1.5">
              <IconBtn
                label="Play from here"
                path={ICON_PLAY}
                tone="teal"
                onClick={() => seek(h.startTime)}
              />
              <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-neutral-500">
                {formatTimestamp(h.startTime)}–{formatTimestamp(h.endTime)}
              </span>

              {editing ? (
                <input
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveNote(h.id, editDraft);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  maxLength={500}
                  className="h-6 min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-1.5 text-xs text-neutral-200 focus:border-teal-400/60"
                />
              ) : (
                <button
                  type="button"
                  title="Edit note"
                  onClick={() => {
                    setEditingId(h.id);
                    setEditDraft(h.note ?? "");
                  }}
                  className="min-w-0 flex-1 truncate text-left text-xs text-neutral-300 transition-colors hover:text-white"
                >
                  {h.note ?? <span className="text-neutral-600">Untitled highlight</span>}
                </button>
              )}

              {h.isPublic && h.shareSlug && (
                <span
                  className="hidden shrink-0 items-center gap-1 rounded bg-teal-400/10 px-1.5 py-0.5 text-[10px] font-medium text-teal-300 sm:flex"
                  title={`Public at /clip/${h.shareSlug}`}
                >
                  <Icon path={ICON_GLOBE} className="h-3 w-3" />
                  Public
                </span>
              )}

              <div className="flex shrink-0 items-center gap-0.5">
                {editing && (
                  <IconBtn
                    label="Save note"
                    path={ICON_CHECK}
                    tone="teal"
                    onClick={() => void saveNote(h.id, editDraft)}
                  />
                )}
                {editing && <IconBtn label="Cancel" path="M18 6 6 18 M6 6l12 12" onClick={() => setEditingId(null)} />}
                {!editing && (
                  <IconBtn
                    label="Edit note"
                    path={ICON_PEN}
                    onClick={() => {
                      setEditingId(h.id);
                      setEditDraft(h.note ?? "");
                    }}
                  />
                )}
                {h.isPublic && h.shareSlug && (
                  <IconBtn
                    label={copiedId === h.id ? "Link copied" : "Copy clip link"}
                    path={copiedId === h.id ? ICON_CHECK : ICON_LINK}
                    tone="teal"
                    onClick={() => void copyLink(h)}
                  />
                )}
                <button
                  type="button"
                  title={h.isPublic ? "Stop sharing" : "Share publicly"}
                  aria-pressed={h.isPublic}
                  disabled={busy}
                  onClick={() => void toggleShare(h)}
                  className={`h-6 rounded px-1.5 text-[10.5px] font-medium transition-colors disabled:opacity-50 ${
                    h.isPublic
                      ? "border border-teal-400/40 text-teal-300 hover:bg-teal-400/10"
                      : "border border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
                  }`}
                >
                  {h.isPublic ? "Unshare" : "Share"}
                </button>
                {confirmId === h.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void removeHighlight(h.id)}
                      className="h-6 rounded bg-red-500/90 px-1.5 text-[10.5px] font-semibold text-white hover:bg-red-500"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="h-6 rounded px-1 text-[10.5px] text-neutral-500 hover:text-neutral-300"
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <IconBtn label="Delete highlight" path={ICON_TRASH} tone="red" onClick={() => setConfirmId(h.id)} />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="border-t border-neutral-800/70 px-3 py-1.5 text-[11px] text-red-400">{error}</p>
      )}
    </section>
  );
}
