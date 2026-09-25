import { NextResponse } from "next/server";
import { db } from "@/db";
import { actionItems, highlights, meetings, summaries, transcriptSegments, users } from "@/db/schema";
import { llmConfigured, llmModel } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const counts = {
      users: db.select().from(users).all().length,
      meetings: db.select().from(meetings).all().length,
      transcriptSegments: db.select().from(transcriptSegments).all().length,
      summaries: db.select().from(summaries).all().length,
      actionItems: db.select().from(actionItems).all().length,
      highlights: db.select().from(highlights).all().length,
    };
    return NextResponse.json({
      ok: true,
      counts,
      db: "sqlite",
      llm: llmConfigured() ? { configured: true, model: llmModel() } : { configured: false },
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
