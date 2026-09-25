import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { DEMO_USER_ID, ensureDemoUser } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * POST /api/calendar — calendar-connect STUB (agent D).
 *
 * INTENTIONALLY STUBBED: there is no real OAuth here, no provider is contacted
 * and no tokens are stored. The only real effect is two columns on the demo
 * user row (`User.calendar_provider`, `User.calendar_connected`), exactly as
 * SCHEMA.md describes. The multi-second "handshake" is simulated client-side.
 *
 * Owner: agent D.
 */

const PROVIDERS = ["google", "outlook"] as const;
type Provider = (typeof PROVIDERS)[number];

function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

function currentState() {
  const user = ensureDemoUser();
  return {
    provider: user.calendarProvider,
    connected: user.calendarConnected,
    user: { id: user.id, name: user.name, email: user.email },
  };
}

export async function GET() {
  return NextResponse.json(currentState());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    provider?: unknown;
  } | null;

  if (!body || typeof body.action !== "string") {
    return NextResponse.json(
      { error: 'Expected a JSON body like { "action": "connect", "provider": "google" }.' },
      { status: 400 },
    );
  }

  if (body.action === "connect") {
    if (!isProvider(body.provider)) {
      return NextResponse.json(
        { error: 'Unknown provider — use "google" or "outlook".' },
        { status: 400 },
      );
    }
    ensureDemoUser();
    db.update(users)
      .set({ calendarProvider: body.provider, calendarConnected: true })
      .where(eq(users.id, DEMO_USER_ID))
      .run();
    return NextResponse.json(currentState());
  }

  if (body.action === "disconnect") {
    ensureDemoUser();
    db.update(users)
      .set({ calendarProvider: null, calendarConnected: false })
      .where(eq(users.id, DEMO_USER_ID))
      .run();
    return NextResponse.json(currentState());
  }

  return NextResponse.json(
    { error: 'Unknown action — use "connect" or "disconnect".' },
    { status: 400 },
  );
}
