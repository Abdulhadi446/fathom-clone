import type { Metadata } from "next";
import Link from "next/link";
import IngestForm from "@/components/ingest/IngestForm";

export const metadata: Metadata = {
  title: "Add meeting — Fathom",
  description:
    "Demo-mode ingest: paste a transcript and run it through the same AI summarizer as the seeded meetings.",
};

/**
 * /ingest — demo-mode ingest (agent D).
 *
 * Simulated capture (a pasted transcript instead of a bot joining a call),
 * real processing (the shared `summarizeMeeting()` from src/lib/summarize.ts).
 */
export default function IngestPage() {
  return (
    <main className="mx-auto w-full max-w-5xl py-10">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Add a meeting</h1>
          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
            Demo
          </span>
          <span className="rounded border border-teal-400/40 bg-teal-400/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-teal-300">
            Simulated capture / real processing
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-neutral-500">
          Paste any transcript and it runs through the same summarizer as the seeded
          meetings — the capture layer is stubbed (no bot joins your call), the summaries,
          templates and action items are the real pipeline.           Prefer the “recorded” path?
          Connect a calendar instead:{" "}
          <Link href="/calendar" className="text-teal-300 hover:text-teal-200">
            /calendar
          </Link>
          .
        </p>
      </header>

      <IngestForm />
    </main>
  );
}
