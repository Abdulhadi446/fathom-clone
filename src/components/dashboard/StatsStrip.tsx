export interface Stat {
  label: string;
  value: string;
  hint?: string;
}

export default function StatsStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-neutral-800/80 bg-neutral-950/60 px-4 py-3"
        >
          <div className="text-[11px] uppercase tracking-wide text-neutral-500">{s.label}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-neutral-100">{s.value}</div>
          {s.hint && <div className="mt-0.5 text-[11px] text-neutral-600">{s.hint}</div>}
        </div>
      ))}
    </div>
  );
}
