"use client";

/** App-shell error boundary — rendered inside the layout when a page throws. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-600">Error</p>
      <h1 className="mt-3 text-xl font-semibold text-white">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-neutral-500">
        The page failed to render. Try again — if it keeps happening, check the server logs
        (<span className="font-mono text-neutral-400">journalctl -u fathom -n 100</span>).
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-md bg-teal-500 px-3.5 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400"
      >
        Try again
      </button>
    </main>
  );
}
