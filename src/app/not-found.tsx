import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-600">404</p>
      <h1 className="mt-3 text-xl font-semibold text-white">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-neutral-500">
        The link may be wrong, or the meeting it pointed at was deleted.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-teal-500 px-3.5 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400"
      >
        Back to meetings
      </Link>
    </main>
  );
}
