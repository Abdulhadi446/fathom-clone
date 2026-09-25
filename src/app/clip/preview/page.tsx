import BarPreview from "./BarPreview";

export const dynamic = "force-dynamic";

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ sel?: string }>;
}) {
  const { sel } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-8">
      <h1 className="text-lg font-semibold">HighlightBar preview (agent C, temporary)</h1>
      <BarPreview initialSelection={sel !== "0"} />
    </main>
  );
}
