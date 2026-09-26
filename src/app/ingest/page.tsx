import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import CaptureTabs from "@/components/ingest/CaptureTabs";

export const metadata: Metadata = {
  title: "Add meeting — Fathom",
  description: "Paste, upload or record a meeting and run it through the AI summarizer.",
};
export const dynamic = "force-dynamic";

/**
 * /ingest — bring a meeting in.
 *
 * Three real capture paths, one processing pipeline (`summarizeMeeting()`):
 * paste text, drop a .txt/.vtt/.srt file, or record the microphone in the
 * browser (live speech recognition + audio upload).
 */
export default async function IngestPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-5xl py-10">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Add a meeting</h1>
          <span className="rounded border border-teal-400/40 bg-teal-400/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-teal-300">
            real processing
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-neutral-500">
          Bring a transcript in and it runs through the same pipeline every other feature reads
          from — AI summaries, action items, transcript search, highlights and shareable clips.
          Everything lands in your account only.{" "}
          <Link href="/calendar" className="text-teal-300 hover:text-teal-200">
            /calendar
          </Link>{" "}
          shows the (still stubbed) auto-capture path.
        </p>
      </header>

      <CaptureTabs userName={user.name} />
    </main>
  );
}
