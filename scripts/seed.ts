import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { loadEnv } from "../src/lib/load-env";

loadEnv();

import { getDb, DATABASE_PATH } from "../src/db";
import {
  users,
  meetings,
  transcriptSegments,
  summaries,
  actionItems,
  highlights,
} from "../src/db/schema";
import { summarizeMeeting, type TemplateId, type TranscriptLine, type MeetingSource } from "../src/lib/summarize";
import { generateTranscript, type TranscriptSpec } from "../src/lib/transcript";

const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, "seed-cache");
const AUDIO_DIR = path.join(ROOT, "public", "audio");

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const RESET = args.has("--reset");

type MeetingKind = "sales-call" | "standup" | "interview" | "general";

interface SeedHighlight {
  start: number;
  end: number;
  note: string;
  shareSlug?: string;
  isPublic?: boolean;
}

interface MeetingSpec {
  id: string;
  title: string;
  kind: MeetingKind;
  startedAt: string;
  durationSeconds: number;
  participants: string[];
  people: { name: string; role: string }[];
  context: string;
  targetLines: number;
  chunkSeconds?: number;
  templates: TemplateId[];
  highlights: SeedHighlight[];
  actionItemCount?: number;
}

const SPECS: MeetingSpec[] = [
  {
    id: "m_acme_discovery",
    title: "Acme Corp — Discovery Call",
    kind: "sales-call",
    startedAt: "2026-09-15T15:00:00.000Z",
    durationSeconds: 2700,
    participants: ["Dana Whitfield", "Tom Okafor", "Rachel Lindqvist", "Samir Haque"],
    people: [
      { name: "Dana Whitfield", role: "Account executive running the call, discovery-question heavy, keeps time" },
      { name: "Tom Okafor", role: "Solutions engineer, joins at minute 8, technical, pragmatic" },
      { name: "Rachel Lindqvist", role: "Director of Operations at Acme Corp, the champion, frustrated with spreadsheets" },
      { name: "Samir Haque", role: "Finance manager at Acme Corp, cost-focused, joins late, asks about billing" },
    ],
    context:
      "Acme Corp (240 employees, logistics) evaluated three meeting-notetaker vendors. Rachel has been piloting our free tier for 3 weeks. They care about CRM write-back, security review, and per-seat pricing. Competitor named: Otter and Fireflies.",
    targetLines: 160,
    templates: ["standard", "sales-call", "exec-brief"],
    highlights: [
      {
        start: 742,
        end: 786,
        note: "Rachel names the real problem — notes never make it into the CRM",
        shareSlug: "acme-crm-pain",
        isPublic: true,
      },
      { start: 1655, end: 1701, note: "Samir asks the pricing question; Dana gives per-seat range" },
    ],
  },
  {
    id: "m_sprint42_standup",
    title: "Sprint 42 Standup",
    kind: "standup",
    startedAt: "2026-09-22T09:30:00.000Z",
    durationSeconds: 900,
    participants: ["Priya Raman", "Marcus Hale", "Lena Ortiz", "Sam Whitaker", "Ibrahim Diallo", "Grace Kim"],
    people: [
      { name: "Priya Raman", role: "Engineering manager, runs standup, terse, timeboxes" },
      { name: "Marcus Hale", role: "Backend engineer, working on ingest pipeline" },
      { name: "Lena Ortiz", role: "Frontend engineer, transcript UI work" },
      { name: "Sam Whitaker", role: "Infra engineer, on-call this week, slightly tired" },
      { name: "Ibrahim Diallo", role: "Data engineer, search indexing" },
      { name: "Grace Kim", role: "Designer, ships small UI details, in a rush" },
    ],
    context:
      "Sprint 42, day 2. Blockers: a flaky transcription worker, an unresolved review on the search PR, and waiting on legal for the export feature copy.",
    targetLines: 55,
    chunkSeconds: 450,
    templates: ["standard", "standup", "decisions"],
    highlights: [{ start: 310, end: 352, note: "Sam flags the transcription worker flakiness" }],
  },
  {
    id: "m_interview_nina",
    title: "Interview — Senior Backend Engineer (Nina Kovač)",
    kind: "interview",
    startedAt: "2026-09-18T17:00:00.000Z",
    durationSeconds: 3300,
    participants: ["Ruth Adeyemi", "Nina Kovač", "Daniel Park"],
    people: [
      { name: "Ruth Adeyemi", role: "Hiring manager, backend lead, asks system-design questions" },
      { name: "Nina Kovač", role: "Candidate, 6 years at a streaming data company, calm, gives structured answers" },
      { name: "Daniel Park", role: "Interviewer, peer backend engineer, coding-round style questions, note taker" },
    ],
    context:
      "Loop for a senior backend role. Round covers system design (multi-tenant ingestion), a coding discussion (idempotent job runner), and behavioral. Nina is strong on distributed systems, lighter on frontend-adjacent work.",
    targetLines: 190,
    templates: ["standard", "interview", "exec-brief"],
    highlights: [
      { start: 1180, end: 1233, note: "Nina's multi-tenant isolation design answer" },
      { start: 2740, end: 2788, note: "Nina asks about on-call — signal of serious intent" },
    ],
  },
  {
    id: "m_q3_product_council",
    title: "Q3 Product Council — Roadmap Lock",
    kind: "general",
    startedAt: "2026-09-24T16:00:00.000Z",
    durationSeconds: 3600,
    participants: [
      "Dana Whitfield",
      "Priya Raman",
      "Marcus Hale",
      "Lena Ortiz",
      "Sam Whitaker",
      "Grace Kim",
      "Ibrahim Diallo",
      "Tom Okafor",
    ],
    people: [
      { name: "Dana Whitfield", role: "Account executive, pushes for what closes deals this quarter" },
      { name: "Priya Raman", role: "Engineering manager, owns the delivery commitments, protective of team capacity" },
      { name: "Marcus Hale", role: "Backend engineer, blunt about technical debt in the ingest pipeline" },
      { name: "Lena Ortiz", role: "Frontend engineer, cares about transcript performance and accessibility" },
      { name: "Sam Whitaker", role: "Infra, cost-conscious, brings up storage growth and on-call load" },
      { name: "Grace Kim", role: "Product designer, argues for the sharing experience being a differentiator" },
      { name: "Ibrahim Diallo", role: "Data/ML engineer, owns search quality and embedding costs" },
      { name: "Tom Okafor", role: "Solutions engineer, relays the top 5 customer asks of the month" },
    ],
    context:
      "Q4 roadmap lock for a meeting-intelligence product. Eight people, one hour, hard stop at the top of the hour. Open items: the public clip-sharing experience, transcript search quality, per-seat pricing changes, storage cost of recordings, the calendar integration, and two enterprise security asks. The group must leave with an ordered list of what ships in Q4.",
    targetLines: 270,
    chunkSeconds: 700,
    templates: ["standard", "decisions", "exec-brief"],
    highlights: [
      { start: 415, end: 468, note: "Grace makes the case that clip sharing is the growth loop" },
      { start: 1520, end: 1577, note: "Storage cost debate — Sam's number lands badly" },
      {
        start: 3110,
        end: 3175,
        note: "The actual Q4 commitment list is read back and agreed",
        shareSlug: "q4-roadmap-lock",
        isPublic: true,
      },
    ],
  },
  {
    id: "m_northwind_renewal",
    title: "Northwind Health — Renewal & Expansion",
    kind: "sales-call",
    startedAt: "2026-09-11T14:00:00.000Z",
    durationSeconds: 2100,
    participants: ["Dana Whitfield", "Marcus Hale", "Priya Nandi", "Leo Fontaine", "Chika Mori"],
    people: [
      { name: "Dana Whitfield", role: "Account executive, renewal-focused, wants a signature this month" },
      { name: "Marcus Hale", role: "Backend engineer, answers the API and data-residency questions" },
      { name: "Priya Nandi", role: "Head of Clinical Ops at Northwind, renewal owner, wants more seats" },
      { name: "Leo Fontaine", role: "IT security lead at Northwind, runs the vendor review" },
      { name: "Chika Mori", role: "Customer success manager, brings usage data" },
    ],
    context:
      "Annual renewal for a 90-seat health-tech customer. Usage is at 71% of licensed seats. Northwind wants SSO and EU data residency before expanding to 140 seats. Security questionnaire is half done.",
    targetLines: 125,
    templates: ["standard", "sales-call", "exec-brief"],
    highlights: [
      { start: 590, end: 640, note: "Chika shows the 71% seat-usage number" },
      { start: 1490, end: 1545, note: "Leo makes SSO a hard gate for expansion", shareSlug: "northwind-sso-gate", isPublic: true },
    ],
  },
  {
    id: "m_priya_marcus_1on1",
    title: "1:1 — Priya & Marcus",
    kind: "general",
    startedAt: "2026-09-22T13:00:00.000Z",
    durationSeconds: 1800,
    participants: ["Priya Raman", "Marcus Hale"],
    people: [
      { name: "Priya Raman", role: "Engineering manager, coaching mode, asks good questions, notes career growth" },
      { name: "Marcus Hale", role: "Backend engineer, wants to own the ingest platform end-to-end, worried about context switching" },
    ],
    context:
      "Recurring weekly 1:1. Topics: Marcus's context switching between two projects, the tech-debt he wants to pay down, a possible staff-engineer track conversation, and his PTO next month.",
    targetLines: 105,
    templates: ["standard", "exec-brief"],
    highlights: [{ start: 1010, end: 1062, note: "Marcus asks for ownership of the ingest platform" }],
  },
  {
    id: "m_eng_all_hands",
    title: "Engineering All-Hands — September",
    kind: "general",
    startedAt: "2026-09-08T17:00:00.000Z",
    durationSeconds: 2400,
    participants: ["Priya Raman", "Marcus Hale", "Lena Ortiz", "Sam Whitaker", "Ibrahim Diallo", "Grace Kim", "Tom Okafor"],
    people: [
      { name: "Priya Raman", role: "Engineering manager, presents metrics and hiring plan" },
      { name: "Marcus Hale", role: "Backend engineer, gives the platform update" },
      { name: "Lena Ortiz", role: "Frontend engineer, demo of the transcript UI rewrite" },
      { name: "Sam Whitaker", role: "Infra, reliability numbers, incident retrospective" },
      { name: "Ibrahim Diallo", role: "Data/ML, search quality experiment results" },
      { name: "Grace Kim", role: "Designer, design-system adoption update" },
      { name: "Tom Okafor", role: "Solutions engineer, top customer escalations" },
    ],
    context:
      "Monthly engineering all-hands. Agenda: September metrics, platform reliability, search experiment results, transcript UI demo, customer escalations, hiring plan, and open floor.",
    targetLines: 145,
    templates: ["standard", "exec-brief", "decisions"],
    highlights: [{ start: 880, end: 930, note: "Sam's incident retrospective — one missed page" }],
  },
  {
    id: "m_design_review_onboarding",
    title: "Design Review — Mobile Onboarding",
    kind: "general",
    startedAt: "2026-09-19T16:00:00.000Z",
    durationSeconds: 1500,
    participants: ["Grace Kim", "Lena Ortiz", "Priya Raman", "Ibrahim Diallo", "Noah Brennan"],
    people: [
      { name: "Grace Kim", role: "Product designer, walks through the flows, defends the simplification" },
      { name: "Lena Ortiz", role: "Frontend engineer, raises implementation cost of gestures" },
      { name: "Priya Raman", role: "Engineering manager, asks about scope and dates" },
      { name: "Ibrahim Diallo", role: "Data engineer, cares about what events we capture on signup" },
      { name: "Noah Brennan", role: "Product manager, decides scope, keeps the meeting moving" },
    ],
    context:
      "Review of a 3-screen mobile onboarding flow replacing a 7-screen wizard. Open questions: whether calendar connect is step 1 or optional step 3, analytics events, and dark-mode support at launch.",
    targetLines: 90,
    templates: ["standard", "exec-brief"],
    highlights: [{ start: 640, end: 690, note: "Noah cuts scope — calendar connect moves to step 3" }],
  },
];

function cachePath(id: string) {
  return path.join(CACHE_DIR, `${id}.json`);
}

interface CachedMeeting {
  promptVersion?: number;
  segments: TranscriptLine[];
  summaries: { template: string; content: string; actionItems: string[]; source: string }[];
}

/** Bump when the summarization prompt/guidance changes so stale cache regenerates. */
const SUMMARY_PROMPT_VERSION = 2;

function readCache(id: string): CachedMeeting | null {
  const file = cachePath(id);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as CachedMeeting;
    if (parsed.segments?.length && parsed.summaries?.length) return parsed;
  } catch {
    /* fall through to regeneration */
  }
  return null;
}

function writeCache(id: string, data: CachedMeeting) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(id), JSON.stringify(data, null, 2));
}

function meetingSource(spec: MeetingSpec, segments: TranscriptLine[]): MeetingSource {
  return {
    title: spec.title,
    startedAt: new Date(spec.startedAt),
    durationSeconds: spec.durationSeconds,
    participants: spec.participants,
    segments,
  };
}

async function generateSummaries(
  spec: MeetingSpec,
  segments: TranscriptLine[],
): Promise<CachedMeeting["summaries"]> {
  const source = meetingSource(spec, segments);
  const cachedSummaries: CachedMeeting["summaries"] = [];
  for (const template of spec.templates) {
    process.stdout.write(`  → summary [${template}] ... `);
    const result = await summarizeMeeting(source, template as TemplateId);
    console.log(`${result.source}, ${result.actionItems.length} action items`);
    cachedSummaries.push({
      template,
      content: result.content,
      actionItems: result.actionItems,
      source: result.source,
    });
  }
  return cachedSummaries;
}

function summariesFresh(spec: MeetingSpec, cached: CachedMeeting): boolean {
  return cached.promptVersion === SUMMARY_PROMPT_VERSION && summariesMatchSpec(spec, cached);
}

function summariesMatchSpec(spec: MeetingSpec, cached: CachedMeeting): boolean {
  const have = cached.summaries.map((s) => s.template).sort().join(",");
  const want = [...spec.templates].sort().join(",");
  return have === want && cached.summaries.every((s) => s.content.length > 80);
}

async function generateMeeting(spec: MeetingSpec): Promise<CachedMeeting> {
  console.log(`  → generating transcript for "${spec.title}" (${spec.durationSeconds}s, ${spec.targetLines} lines)...`);
  const transcriptSpec: TranscriptSpec = {
    title: spec.title,
    context: spec.context,
    durationSeconds: spec.durationSeconds,
    people: spec.people,
    targetLines: spec.targetLines,
    chunkSeconds: spec.chunkSeconds,
  };
  const segments = await generateTranscript(transcriptSpec);
  console.log(`  → transcript: ${segments.length} segments`);

  const summariesForMeeting = await generateSummaries(spec, segments);
  return { segments, summaries: summariesForMeeting };
}

function ensureAudio(spec: MeetingSpec): string {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const file = path.join(AUDIO_DIR, `${spec.id}.m4a`);
  if (fs.existsSync(file)) return file;
  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f", "lavfi",
        "-i", "anullsrc=r=16000:cl=mono",
        "-t", String(spec.durationSeconds),
        "-c:a", "aac",
        "-b:a", "8k",
        file,
      ],
      { stdio: "ignore" },
    );
    return file;
  } catch (err) {
    console.warn(`  ! ffmpeg audio generation failed for ${spec.id}:`, String(err).slice(0, 160));
    return "";
  }
}

function idFor(prefix: string, i: number, meetingId: string) {
  return `${prefix}_${meetingId}_${i}`;
}

async function main() {
  console.log(`Seeding ${DATABASE_PATH}`);
  const db = getDb();

  if (RESET) {
    console.log("  --reset: clearing all tables");
    db.delete(highlights).run();
    db.delete(actionItems).run();
    db.delete(summaries).run();
    db.delete(transcriptSegments).run();
    db.delete(meetings).run();
    db.delete(users).run();
  }

  const userId = "u_demo_alex";
  const existingUser = db.select().from(users).where(eq(users.id, userId)).all();
  if (existingUser.length === 0) {
    db.insert(users)
      .values({
        id: userId,
        name: "Alex Rivera",
        email: "alex@example.com",
        calendarConnected: false,
        calendarProvider: null,
      })
      .run();
    console.log("  created demo user Alex Rivera <alex@example.com>");
  }

  const hasLlm = Boolean(process.env.LLM_API_KEY);
  console.log(`  LLM: ${hasLlm ? `configured (model ${process.env.LLM_MODEL || "gpt-4o-mini"})` : "NOT configured — fallback summarizer"}`);

  let llmCalls = 0;
  for (const spec of SPECS) {
    console.log(`\n▸ ${spec.title}`);
    let cached = FORCE ? null : readCache(spec.id);
    if (cached && !summariesFresh(spec, cached)) {
      console.log(`  ! cached summaries are stale (template set changed) — regenerating summaries`);
      cached.summaries = await generateSummaries(spec, cached.segments);
      writeCache(spec.id, cached);
      llmCalls++;
    } else if (cached) {
      console.log(`  ✓ cache hit (${cached.segments.length} segments, ${cached.summaries.length} summaries)`);
    } else {
      cached = await generateMeeting(spec);
      writeCache(spec.id, cached);
      llmCalls++;
    }

    cached.promptVersion = SUMMARY_PROMPT_VERSION;
    writeCache(spec.id, cached);

    const { segments, summaries: summaryRows } = cached;
    const startedAtMs = new Date(spec.startedAt).getTime();

    db.delete(highlights).where(eq(highlights.meetingId, spec.id)).run();
    db.delete(actionItems).where(eq(actionItems.meetingId, spec.id)).run();
    db.delete(summaries).where(eq(summaries.meetingId, spec.id)).run();
    db.delete(transcriptSegments).where(eq(transcriptSegments.meetingId, spec.id)).run();
    db.delete(meetings).where(eq(meetings.id, spec.id)).run();

    db.insert(meetings)
      .values({
        id: spec.id,
        title: spec.title,
        startedAt: new Date(startedAtMs),
        durationSeconds: spec.durationSeconds,
        participants: spec.participants,
        source: "recorded",
        userId,
      })
      .run();

    db.insert(transcriptSegments)
      .values(
        segments.map((s, i) => ({
          id: idFor("seg", i, spec.id),
          meetingId: spec.id,
          speaker: s.speaker,
          startTime: s.startTime,
          endTime: s.endTime,
          text: s.text,
        })),
      )
      .run();

    for (const s of summaryRows) {
      db.insert(summaries)
        .values({
          id: idFor("sum", summaryRows.indexOf(s), spec.id),
          meetingId: spec.id,
          template: s.template,
          content: s.content,
          createdAt: new Date(),
        })
        .run();
    }

    const primary =
      summaryRows.find((s) => s.template === "standard") ?? summaryRows[0];
    const merged: string[] = [];
    const seenItems = new Set<string>();
    for (const row of [primary, ...summaryRows]) {
      for (const item of row?.actionItems ?? []) {
        const key = item.toLowerCase();
        if (seenItems.has(key)) continue;
        seenItems.add(key);
        merged.push(item);
      }
      if (merged.length >= (spec.actionItemCount ?? 4)) break;
    }
    const items = merged.slice(0, spec.actionItemCount ?? 4);
    if (items.length) {
      db.insert(actionItems)
        .values(
          items.map((text, i) => ({
            id: idFor("act", i, spec.id),
            meetingId: spec.id,
            text,
            done: false,
            sortOrder: i,
            createdAt: new Date(),
          })),
        )
        .run();
    }

    if (spec.highlights.length) {
      db.insert(highlights)
        .values(
          spec.highlights.map((h, i) => ({
            id: idFor("hl", i, spec.id),
            meetingId: spec.id,
            startTime: h.start,
            endTime: h.end,
            note: h.note,
            shareSlug: h.shareSlug ?? null,
            isPublic: h.isPublic ?? false,
            createdAt: new Date(),
          })),
        )
        .run();
    }

    ensureAudio(spec);

    console.log(
      `  ✓ ${segments.length} segments, ${summaryRows.length} summaries, ${items.length} action items, ${spec.highlights.length} highlights, audio ✓`,
    );
  }

  const counts = {
    meetings: db.select().from(meetings).all().length,
    segments: db.select().from(transcriptSegments).all().length,
    summaries: db.select().from(summaries).all().length,
    actionItems: db.select().from(actionItems).all().length,
    highlights: db.select().from(highlights).all().length,
  };
  console.log(`\nDone. ${JSON.stringify(counts)}${llmCalls ? ` (generated ${llmCalls} meeting(s) via LLM)` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
