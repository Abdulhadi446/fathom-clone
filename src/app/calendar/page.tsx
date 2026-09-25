import type { Metadata } from "next";
import CalendarConnect from "@/components/calendar/CalendarConnect";
import { ensureDemoUser } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calendar — Fathom",
  description: "Connect Google Calendar or Outlook so meetings are captured automatically.",
};

/**
 * /calendar — calendar-connect STUB (agent D).
 *
 * Read server-side so the connected state survives reloads: it lives on
 * `User.calendar_provider` / `User.calendar_connected` for the single demo user.
 * No OAuth happens anywhere in this build — see src/app/api/calendar/route.ts.
 */
export default function CalendarPage() {
  const user = ensureDemoUser();

  return (
    <main className="mx-auto w-full max-w-3xl py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Calendar</h1>
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
              Demo
            </span>
          </div>
          <p className="mt-1.5 max-w-xl text-sm text-neutral-500">
            Link a provider so upcoming calls are detected, named and joined automatically.
            The capture layer is stubbed in this build — the connect flow is simulated end to
            end, and the resulting connection is stored on the demo user row.
          </p>
        </div>
        <div className="hidden shrink-0 text-right text-xs text-neutral-600 sm:block">
          <div>Signed in as</div>
          <div className="mt-0.5 text-neutral-400">{user.name}</div>
          <div>{user.email}</div>
        </div>
      </header>

      <CalendarConnect
        initial={{
          provider: user.calendarProvider,
          connected: user.calendarConnected,
          user: { id: user.id, name: user.name, email: user.email },
        }}
      />

      <section className="mt-8 rounded-xl border border-neutral-800/70 bg-neutral-950/40 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          What happens after you connect
        </h2>
        <ol className="mt-3 grid gap-2 text-xs leading-relaxed text-neutral-500 sm:grid-cols-3">
          <li className="rounded-lg border border-neutral-800/70 bg-neutral-900/40 p-3">
            <span className="mb-1 block font-medium text-neutral-300">1. Detect</span>
            Events in the next 30 days are read from the linked calendar (simulated here).
          </li>
          <li className="rounded-lg border border-neutral-800/70 bg-neutral-900/40 p-3">
            <span className="mb-1 block font-medium text-neutral-300">2. Join &amp; record</span>
            The notetaker joins and captures audio + transcript for each meeting.
          </li>
          <li className="rounded-lg border border-neutral-800/70 bg-neutral-900/40 p-3">
            <span className="mb-1 block font-medium text-neutral-300">3. Summarize</span>
            Transcripts run through the shared summarizer — or use{" "}
            <span className="text-teal-300">Add meeting</span> to paste one yourself.
          </li>
        </ol>
      </section>
    </main>
  );
}
