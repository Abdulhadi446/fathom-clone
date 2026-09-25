"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Markdown from "./Markdown";

export interface TemplateSummary {
  template: string;
  label: string;
  description: string;
  content: string;
  /** Preformatted on the server — keeps SSR and hydration text identical. */
  createdAtLabel: string;
}

export default function SummaryPanel({ summaries }: { summaries: TemplateSummary[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (summaries.length === 0) {
    return (
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-semibold text-white">AI summary</h2>
        <p className="mt-2 text-sm text-neutral-500">No summary has been generated for this meeting yet.</p>
      </section>
    );
  }

  const requested = searchParams.get("template");
  const available = summaries.map((s) => s.template);
  const active = requested && available.includes(requested) ? requested : summaries[0].template;
  const current = summaries.find((s) => s.template === active) ?? summaries[0];

  const select = (template: string) => {
    if (template === active) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("template", template);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40">
      <header className="border-b border-neutral-800 bg-neutral-950/40 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">AI summary</h2>
          <span className="text-[11px] text-neutral-500">
            {summaries.length} template{summaries.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="scroll-thin -mx-1 mt-3 flex gap-1 overflow-x-auto pb-0.5" role="tablist" aria-label="Summary template">
          {summaries.map((s) => {
            const isActive = s.template === active;
            return (
              <button
                key={s.template}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => select(s.template)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-teal-400 text-neutral-950"
                    : "border border-neutral-700 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="px-4 py-3">
        <p className="mb-3 border-b border-neutral-800/70 pb-3 text-[11px] leading-4 text-neutral-500">
          {current.description}
        </p>
        <Markdown source={current.content} />
        <p className="mt-4 text-[11px] text-neutral-600">Generated {current.createdAtLabel}</p>
      </div>
    </section>
  );
}
