import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — revoke the current session and clear the cookie. */
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
