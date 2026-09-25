/** Wraps case-insensitive matches of `query` inside `<mark>`. */
export default function HighlightMatch({
  text,
  query,
  className = "",
  markClassName = "rounded-[3px] bg-teal-400/25 px-0.5 text-teal-100",
}: {
  text: string;
  query: string;
  className?: string;
  markClassName?: string;
}) {
  const q = query.trim();
  if (!q) return <span className={className}>{text}</span>;

  const parts: { s: string; hit: boolean }[] = [];
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const idx = lowerText.indexOf(lowerQ, i);
    if (idx === -1) {
      parts.push({ s: text.slice(i), hit: false });
      break;
    }
    if (idx > i) parts.push({ s: text.slice(i, idx), hit: false });
    parts.push({ s: text.slice(idx, idx + q.length), hit: true });
    i = idx + q.length;
  }

  return (
    <span className={className}>
      {parts.map((p, n) =>
        p.hit ? (
          <mark key={n} className={markClassName}>
            {p.s}
          </mark>
        ) : (
          <span key={n}>{p.s}</span>
        ),
      )}
    </span>
  );
}
