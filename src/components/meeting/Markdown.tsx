"use client";

import type { ReactNode } from "react";

/**
 * Hand-rolled Markdown renderer (headings, lists, quotes, code, emphasis).
 * Deliberately dependency-free — the summaries we produce only use this subset.
 */

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "code"; lines: string[] }
  | { kind: "hr" };

function parse(source: string): Block[] {
  // Some seeded/LLM outputs wrap everything in a literal <markdown> fence.
  const cleaned = source
    .replace(/<\/?markdown>/gi, "")
    .replace(/^\s*```\s*(?:markdown|md)\s*$/gim, "");
  const lines = cleaned.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (/^```/.test(line.trim())) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ kind: "code", lines: code });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const text: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        text.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", text: text.join(" ").trim() });
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      const items: string[] = [];
      while (i < lines.length) {
        const m = isOrdered ? /^\s*\d+[.)]\s+(.*)$/.exec(lines[i]) : /^\s*[-*+]\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push(m[1].trim());
        i++;
      }
      blocks.push({ kind: "list", ordered: isOrdered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,6})\s+/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i]) && !/^\s*>\s?/.test(lines[i]) && !/^```/.test(lines[i].trim())) {
      paragraph.push(lines[i].trim());
      i++;
    }
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

function renderInline(text: string): ReactNode[] {
  const parts = text.split(INLINE).filter((p) => p !== undefined && p !== "");
  return parts.map((part, idx) => {
    if (/^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part)) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code key={idx} className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[12px] text-teal-300">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part)) {
      return (
        <em key={idx} className="italic text-neutral-200">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export default function Markdown({ source }: { source: string }) {
  const blocks = parse(source ?? "");

  return (
    <div className="text-sm text-neutral-300">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "heading": {
            const cls =
              block.level <= 2
                ? "mt-5 mb-2 text-[15px] font-semibold tracking-tight text-white first:mt-0"
                : "mt-4 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-300/90 first:mt-0";
            const Tag = (block.level <= 2 ? "h3" : "h4") as "h3" | "h4";
            return (
              <Tag key={i} className={cls}>
                {renderInline(block.text)}
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={i} className="my-2 leading-6 text-neutral-300 first:mt-0">
                {renderInline(block.text)}
              </p>
            );
          case "list":
            return block.ordered ? (
              <ol key={i} className="my-2 list-decimal space-y-1.5 pl-5 marker:text-neutral-500">
                {block.items.map((item, j) => (
                  <li key={j} className="leading-6">
                    {renderInline(item)}
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="my-2 list-disc space-y-1.5 pl-5 marker:text-teal-500/70">
                {block.items.map((item, j) => (
                  <li key={j} className="leading-6">
                    {renderInline(item)}
                  </li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <blockquote key={i} className="my-3 border-l-2 border-teal-400/40 pl-3 text-neutral-400 italic">
                {renderInline(block.text)}
              </blockquote>
            );
          case "code":
            return (
              <pre
                key={i}
                className="my-3 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 font-mono text-xs leading-5 text-neutral-300"
              >
                {block.lines.join("\n")}
              </pre>
            );
          case "hr":
            return <hr key={i} className="my-4 border-neutral-800" />;
        }
      })}
    </div>
  );
}
