import { chatJSON, type ChatMessage } from "./llm";

/**
 * THE shared summarization entry point.
 *
 * Used by the ingest pipeline (POST /api/ingest) — the only way meetings
 * enter the system now that there is no seed data.
 *
 * Signature is stable — do not change it without updating ARCHITECTURE.md.
 */

export const TEMPLATES = [
  {
    id: "standard",
    label: "Summary",
    description: "Balanced overview: what was discussed, decisions, next steps.",
  },
  {
    id: "sales-call",
    label: "Sales call",
    description: "Pain points, stakeholders, objections, deal motion and next steps.",
  },
  {
    id: "standup",
    label: "Standup",
    description: "Done / doing / blocked, in the order the team actually said it.",
  },
  {
    id: "interview",
    label: "Interview",
    description: "Candidate signal, strengths, concerns and a hiring recommendation.",
  },
  {
    id: "decisions",
    label: "Decisions & risks",
    description: "Just the decisions taken, owners, and the risks raised.",
  },
  {
    id: "exec-brief",
    label: "Exec brief",
    description: "Four sentences and three bullets — the hallway version.",
  },
] as const;

export type TemplateId = (typeof TEMPLATES)[number]["id"];

export function templateLabel(id: string): string {
  return TEMPLATES.find((t) => t.id === id)?.label ?? id;
}

export interface TranscriptLine {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface MeetingSource {
  title: string;
  startedAt: Date | number | string;
  durationSeconds: number;
  participants: string[];
  segments: TranscriptLine[];
}

export interface SummarizeResult {
  template: string;
  content: string;
  actionItems: string[];
  source: "llm" | "fallback";
}

const TEMPLATE_GUIDANCE: Record<TemplateId, string> = {
  standard:
    "Write a crisp meeting summary: a 2-3 sentence overview, then 'Key discussion points' as bullets, then 'Decisions' and 'Next steps'.",
  "sales-call":
    "Write a sales-call brief: 'Account context', 'Pain points raised', 'Who was in the room and what they care about', 'Objections / competition mentioned', 'Deal signals (budget, timeline, authority)', 'Next steps with dates'.",
  standup:
    "Write a standup digest: 'Done yesterday', 'Doing today', 'Blockers', each as bullets attributed to the person who said it.",
  interview:
    "Write an interview scorecard: 'Role and loop', 'Strengths (with evidence from the transcript)', 'Concerns / gaps', 'Verdict' with a hire/no-hire leaning.",
  decisions:
    "Write only decisions and risks: 'Decisions made' (each with an owner if named), 'Open questions', 'Risks and dependencies'.",
  "exec-brief":
    "Write an executive brief: 4-6 sentences of narrative an exec would read in the hallway, then three bullets — 'Why it matters', 'What changed', 'Ask / decision needed'.",
};

const SYSTEM_PROMPT = `You are the AI notetaker inside a meeting-intelligence product (Fathom-style).
You receive a raw transcript of a meeting with speaker-labelled lines and timestamps.
Rules:
- Ground everything in the transcript. Never invent facts, names, numbers or dates that are not there.
- Preserve concrete details: names, numbers, dates, commitments, product terms.
- Output Markdown only inside the "content" field, no code fences.
- Be useful and specific, not generic. Prefer short bullets over prose.
- actionItems must be 2-6 concrete follow-ups, each a single imperative sentence (<= 160 chars) that a person could actually do. Only include items the transcript supports.`;

function transcriptToPrompt(segments: TranscriptLine[]): string {
  return segments
    .map((s) => `${formatClock(s.startTime)} ${s.speaker}: ${s.text}`)
    .join("\n");
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0
    ? `${h}:${mm}:${String(sec).padStart(2, "0")}`
    : `${mm}:${String(sec).padStart(2, "0")}`;
}

const MAX_PROMPT_CHARS = 110_000;

function fitTranscript(text: string): string {
  if (text.length <= MAX_PROMPT_CHARS) return text;
  const head = text.slice(0, Math.floor(MAX_PROMPT_CHARS * 0.65));
  const tail = text.slice(Math.floor(text.length - MAX_PROMPT_CHARS * 0.3));
  return `${head}\n\n[...middle of transcript omitted to fit the context window...]\n\n${tail}`;
}

export async function summarizeMeeting(
  meeting: MeetingSource,
  template: TemplateId,
): Promise<SummarizeResult> {
  const transcript = fitTranscript(transcriptToPrompt(meeting.segments));
  const date = new Date(meeting.startedAt).toISOString().slice(0, 16).replace("T", " ");
  const guidance = TEMPLATE_GUIDANCE[template] ?? TEMPLATE_GUIDANCE.standard;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Template to apply: ${template}
${guidance}

Meeting title: ${meeting.title}
Date: ${date} UTC
Duration: ${meeting.durationSeconds}s
Participants: ${meeting.participants.join(", ")}

Transcript:
${transcript}

Respond with JSON only:
{"content": "<markdown summary>", "actionItems": ["<follow-up 1>", "<follow-up 2>"]}`,
    },
  ];

  try {
    let parsed = await chatJSON<{ content?: string; actionItems?: string[] }>(messages, {
      maxTokens: 3000,
    });
    let actionItems = normalizeActionItems(parsed.actionItems ?? []);
    if (actionItems.length === 0) {
      // models occasionally drop the array on long outputs — one targeted retry
      const retry = await chatJSON<{ content?: string; actionItems?: string[] }>(
        [...messages.slice(0, -1), {
          role: "user",
          content: `${messages[messages.length - 1].content}\n\nREMINDER: finish with a non-empty "actionItems" array of 2-6 real follow-ups taken from the transcript.`,
        }],
        { maxTokens: 3400 },
      );
      if ((retry.content ?? "").trim()) parsed = retry;
      actionItems = normalizeActionItems((retry.actionItems ?? []).length ? retry.actionItems! : parsed.actionItems ?? []);
    }
    const content = (parsed.content ?? "").trim();
    if (!content) throw new Error("empty content from model");
    return { template, content, actionItems, source: "llm" };
  } catch (err) {
    console.warn(`[summarize] LLM failed (${template}), using fallback:`, String(err).slice(0, 200));
    return { ...fallbackSummarize(meeting, template), template };
  }
}

function normalizeActionItems(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const text = String(raw)
      .replace(/^[-*•\d.)\s]+/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 6) break;
  }
  return out;
}

/** Deterministic last-resort summarizer so the app never renders an empty panel. */
export function fallbackSummarize(
  meeting: MeetingSource,
  template: string,
): Omit<SummarizeResult, "template"> {
  const lines = meeting.segments;
  const speakers = Array.from(new Set(lines.map((l) => l.speaker)));
  const bucket = Math.max(1, Math.ceil(lines.length / 5));
  const sections: string[] = ["## Overview"];

  sections.push(
    `${meeting.title} ran ${Math.round(meeting.durationSeconds / 60)} minutes with ${meeting.participants.length} participants (${speakers.join(", ")}).`,
  );
  sections.push("");
  sections.push("## Key discussion points");

  for (let i = 0; i < lines.length && sections.length < 40; i += bucket) {
    const line = lines[i];
    if (line.text.trim()) sections.push(`- **${line.speaker}** (${formatClock(line.startTime)}): ${line.text}`);
  }

  sections.push("");
  sections.push("## Next steps");
  const actionItems = lines
    .filter((l) => /\b(will|should|need to|let's|todo|action|follow up|by (mon|tue|wed|thu|fri)|next week)\b/i.test(l.text))
    .slice(0, 5)
    .map((l) => `${l.speaker} to: ${l.text.replace(/\s+/g, " ").slice(0, 160)}`);
  if (actionItems.length === 0 && lines.length > 0) {
    actionItems.push(`Review the discussion from ${meeting.title} and circulate notes`);
  }
  actionItems.forEach((a) => sections.push(`- ${a}`));

  if (template === "decisions") {
    return {
      content: `## Decisions made\n\n${sections
        .filter((s) => /\b(decid|agree|we'll go with|approved|ship)\b/i.test(s))
        .join("\n") || "- See full summary."}\n\n## Open questions\n\n- Revisit items flagged as open in the transcript.\n\n## Risks and dependencies\n\n- No explicit risks captured (generated without LLM).`,
      actionItems,
      source: "fallback",
    };
  }

  return {
    content: sections.join("\n"),
    actionItems,
    source: "fallback",
  };
}
