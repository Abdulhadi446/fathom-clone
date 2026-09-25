import Link from "next/link";
import { listMeetingsWithSnippet } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const meetings = listMeetingsWithSnippet();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Meeting intelligence</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Foundation build — seeded with {meetings.length} meetings. Dashboard, search and
          sharing land next.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Foundation endpoints</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link className="rounded-md border border-neutral-700 px-3 py-1.5 hover:bg-neutral-900" href="/api/health">
            /api/health
          </Link>
          <Link className="rounded-md border border-neutral-700 px-3 py-1.5 hover:bg-neutral-900" href="/api/meetings">
            /api/meetings
          </Link>
        </div>
      </div>
    </main>
  );
}
