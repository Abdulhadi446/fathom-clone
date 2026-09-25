import Link from "next/link";

/** Clean dark 404 for unknown / revoked / private clip slugs. */
export default function ClipNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="font-mono text-5xl font-semibold text-neutral-700">404</p>
      <h1 className="text-xl font-semibold text-white">This clip isn’t available</h1>
      <p className="text-sm leading-relaxed text-neutral-500">
        The link is invalid, the clip was unshared, or it never existed. Ask whoever sent it
        for a fresh link.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
      >
        Back to Fathom
      </Link>
    </main>
  );
}
