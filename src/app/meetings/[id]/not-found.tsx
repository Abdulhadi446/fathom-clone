import Link from "next/link";

export default function MeetingNotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-sm uppercase tracking-[0.18em] text-neutral-600">404</p>
      <h1 className="text-xl font-semibold text-white">Meeting not found</h1>
      <p className="max-w-sm text-sm text-neutral-500">
        This meeting id doesn’t exist (or it was removed). It may have been recorded under a different workspace.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-800 hover:text-white"
      >
        ← Back to meetings
      </Link>
    </main>
  );
}
