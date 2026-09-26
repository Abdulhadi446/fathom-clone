import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { searchAll } from "@/lib/queries";
import SearchBox from "@/components/dashboard/SearchBox";
import SearchResults from "@/components/dashboard/SearchResults";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Search — Fathom",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { q = "" } = await searchParams;
  const query = q.trim();
  const hits = query.length >= 2 ? searchAll(user.id, query) : [];

  return (
    <main className="flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Search</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Titles, transcript text and AI summaries across every meeting.
          </p>
        </div>
        <div className="max-w-2xl">
          <SearchBox initialQuery={query} autoFocus />
        </div>
      </header>

      <SearchResults query={query} hits={hits} />
    </main>
  );
}
