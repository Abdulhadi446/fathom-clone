import { NextResponse } from "next/server";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { actionItems, highlights, meetings, sessions, summaries, transcriptSegments, users } from "@/db/schema";
import { llmConfigured, llmModel } from "@/lib/llm";
import { sttAvailable } from "@/lib/stt";

export const dynamic = "force-dynamic";

const STARTED_AT = Date.now();

/** Aggregate counts with one COUNT(*) per table — never load rows into memory. */
function counts() {
  const n = (table: typeof users | typeof meetings | typeof transcriptSegments | typeof summaries | typeof actionItems | typeof highlights | typeof sessions) =>
    db.select({ n: count() }).from(table).all()[0]?.n ?? 0;
  return {
    users: n(users),
    meetings: n(meetings),
    transcriptSegments: n(transcriptSegments),
    summaries: n(summaries),
    actionItems: n(actionItems),
    highlights: n(highlights),
    sessions: n(sessions),
  };
}

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      counts: counts(),
      db: "sqlite",
      llm: llmConfigured() ? { configured: true, model: llmModel() } : { configured: false },
      stt: { available: sttAvailable() },
      mail: { configured: Boolean(process.env.RESEND_API_KEY) },
      uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
