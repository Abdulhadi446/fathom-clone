"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SAMPLE_TITLE, SAMPLE_TRANSCRIPT } from "./sample";

interface SummaryBadge {
  template: string;
  source: "llm" | "fallback";
  actionItems: number;
}

interface IngestResult {
  meetingId: string;
  link: string;
  title: string;
  startedAt: string;
  durationSeconds: number;
  participants: string[];
  segmentCount: number;
  summaries: SummaryBadge[];
  actionItemCount: number;
  generator: "llm" | "mixed" | "fallback" | "none";
  warning: string | null;
}

const TEMPLATE_LABELS: Record<string, string> = {
  standard: "Summary",
  "exec-brief": "Exec brief",
};

const FIELD =
  "mt-1.5 w-full rounded-md border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 transition-colors focus:border-teal-400/60";

const PLACEHOLDER = `00:03 Priya: we should ship the search fix on Thursday
[12:04] Marcus: I'll take the deploy notes
Priya: plain "Speaker: text" lines work too
…any other line just continues the previous speaker`;

function nowLocalValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function IngestForm() {
  const [title, setTitle] = useState("");
  const [startedAt, setStartedAt] = useState(nowLocalValue);
  const [participants, setParticipants] = useState("");
  const [transcript, setTranscript] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);

  const lineCount = useMemo(
    () => transcript.split("\n").filter((line) => line.trim()).length,
    [transcript],
  );

  function reset() {
    setTitle("");
    setStartedAt(nowLocalValue());
    setParticipants("");
    setTranscript("");
    setFileName(null);
    setError(null);
    setResult(null);
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setTranscript(String(reader.result ?? ""));
      setFileName(file.name);
      setError(null);
    };
    reader.onerror = () => setError("Couldn't read that file — paste the transcript instead.");
    reader.readAsText(file);
    event.target.value = "";
  }

  function useSample() {
    setTitle(SAMPLE_TITLE);
    setTranscript(SAMPLE_TRANSCRIPT);
    setParticipants("");
    setFileName("built-in sample");
    setError(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (!title.trim()) {
      setError("Give the meeting a title.");
      return;
    }
    if (!transcript.trim()) {
      setError("Paste a transcript (or hit “Try a sample”) before ingesting.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, transcript, startedAt, participants }),
      });
      const data = (await res.json().catch(() => null)) as (IngestResult & { error?: string }) | null;
      if (!res.ok || !data?.meetingId) {
        setError(data?.error ?? "Couldn't ingest that transcript — please try again.");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error — couldn't reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <section className="rounded-xl border border-teal-400/30 bg-teal-400/[0.04] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-400 text-xs font-bold text-black">
            ✓
          </span>
          <h2 className="text-base font-semibold text-white">Meeting created</h2>
          <span className="rounded border border-neutral-700 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-neutral-400">
            source: demo
          </span>
        </div>

        <p className="mt-2 text-sm text-neutral-400">
          <span className="text-neutral-200">{result.title}</span> · {result.segmentCount} segments ·{" "}
          {formatDuration(result.durationSeconds)} · {result.participants.join(", ") || "no participants"}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {result.summaries.map((summary) => (
            <div
              key={summary.template}
              className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-neutral-200">
                  {TEMPLATE_LABELS[summary.template] ?? summary.template}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    summary.source === "llm"
                      ? "border border-teal-400/40 bg-teal-400/10 text-teal-300"
                      : "border border-neutral-700 bg-neutral-900 text-neutral-400"
                  }`}
                >
                  {summary.source === "llm" ? "llm" : "fallback"}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {summary.actionItems} action item{summary.actionItems === 1 ? "" : "s"} extracted
              </p>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-neutral-500">
          {result.generator === "llm"
            ? "Both summaries were generated by the LLM (source: llm) via summarizeMeeting()."
            : result.generator === "mixed"
              ? "One summary came from the LLM, the other from the deterministic fallback (summarizeMeeting() degrades when the model is unavailable)."
              : result.generator === "fallback"
                ? "The LLM wasn't reachable, so summarizeMeeting() used its deterministic fallback — rows are real either way."
                : "No summaries were generated."}
        </p>

        {result.warning && (
          <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            {result.warning}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href={result.link}
            className="rounded-md bg-teal-400 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-teal-300"
          >
            Open meeting →
          </Link>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-900"
          >
            Ingest another
          </button>
          <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-300">
            Back to dashboard
          </Link>
          <span className="ml-auto font-mono text-[11px] text-neutral-600">{result.meetingId}</span>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950/70 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="ingest-title" className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Meeting title
              </label>
              <input
                id="ingest-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Sprint 42 — release sync"
                className={FIELD}
                maxLength={200}
              />
            </div>
            <div>
              <label htmlFor="ingest-date" className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Date &amp; time
              </label>
              <input
                id="ingest-date"
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                className={`${FIELD} [color-scheme:dark]`}
              />
            </div>
            <div>
              <label htmlFor="ingest-participants" className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Participants <span className="normal-case text-neutral-600">(optional)</span>
              </label>
              <input
                id="ingest-participants"
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                placeholder="Priya, Marcus — auto-detected if blank"
                className={FIELD}
              />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <label htmlFor="ingest-transcript" className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Transcript
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-neutral-600">
                  {lineCount} lines · {transcript.length.toLocaleString()} chars
                </span>
                <label className="cursor-pointer rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-900">
                  Upload .txt
                  <input type="file" accept=".txt,text/plain,text/*" className="hidden" onChange={onFile} />
                </label>
                <button
                  type="button"
                  onClick={useSample}
                  className="rounded-md border border-teal-400/40 bg-teal-400/10 px-2.5 py-1 text-xs text-teal-300 transition-colors hover:bg-teal-400/20"
                >
                  Try a sample
                </button>
              </div>
            </div>
            <textarea
              id="ingest-transcript"
              value={transcript}
              onChange={(e) => {
                setTranscript(e.target.value);
                setFileName(null);
              }}
              placeholder={PLACEHOLDER}
              spellCheck={false}
              className={`${FIELD} scroll-thin min-h-[320px] resize-y font-mono text-[13px] leading-relaxed`}
            />
            {fileName && (
              <p className="mt-1.5 text-[11px] text-teal-300/80">
                Loaded “{fileName}” — edit it below if you like.
              </p>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4">
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Accepted line formats
            </h2>
            <ul className="mt-2.5 space-y-2 font-mono text-[11px] leading-relaxed text-neutral-400">
              <li className="rounded border border-neutral-800 bg-black/40 px-2 py-1.5">
                00:03 Priya: we should ship…
              </li>
              <li className="rounded border border-neutral-800 bg-black/40 px-2 py-1.5">
                1:02:03 Priya: longer form…
              </li>
              <li className="rounded border border-neutral-800 bg-black/40 px-2 py-1.5">
                [12:04] Priya: bracketed…
              </li>
              <li className="rounded border border-neutral-800 bg-black/40 px-2 py-1.5">
                Priya: speaker only
              </li>
            </ul>
            <p className="mt-2.5 text-[11px] leading-relaxed text-neutral-600">
              Any other line continues the previous speaker. Untimed lines get synthetic
              timestamps. Blank lines and <span className="font-mono">---</span> separators are
              skipped.
            </p>
          </section>

          <section className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4">
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              What happens on submit
            </h2>
            <ol className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-neutral-600">
              <li>
                <span className="text-neutral-400">1.</span> The paste is parsed into
                TranscriptSegment rows.
              </li>
              <li>
                <span className="text-neutral-400">2.</span> A Meeting row is written with{" "}
                <span className="font-mono text-neutral-400">source = &quot;demo&quot;</span>.
              </li>
              <li>
                <span className="text-neutral-400">3.</span> The shared{" "}
                <span className="font-mono text-neutral-400">summarizeMeeting()</span> runs the
                Summary + Exec brief templates and extracts action items.
              </li>
            </ol>
          </section>
        </aside>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-teal-400 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
          )}
          {submitting ? "Parsing & summarizing…" : "Create meeting"}
        </button>
        <p className="text-xs text-neutral-600">
          {submitting
            ? "Two templates are running through the shared summarizer — usually 5–20 s."
            : "Real processing: 2 templates through the same summarizer as the seeded meetings."}
        </p>
      </div>
    </form>
  );
}
