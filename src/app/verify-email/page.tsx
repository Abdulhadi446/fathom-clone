import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { consumeAuthToken } from "@/lib/tokens";
import { ResendVerifyButton } from "@/components/account/SettingsPanels";

export const metadata: Metadata = { title: "Verify email — Fathom" };
export const dynamic = "force-dynamic";

/**
 * The landing page for the link in the verification email (GET, so the link
 * works from any mail client without a round trip).
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const signedIn = await getSessionUser();

  let outcome: "verified" | "invalid" | "pending" = token ? "invalid" : "pending";
  if (token) {
    const userId = consumeAuthToken(token, "verify_email");
    if (userId) {
      db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId)).run();
      outcome = "verified";
    }
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-950/60 p-6 text-center">
        <Link href="/" className="mb-6 block text-lg font-semibold tracking-tight text-white">
          Fathom
        </Link>

        {outcome === "verified" && (
          <>
            <h1 className="text-lg font-semibold text-white">Email confirmed</h1>
            <p className="mb-5 mt-2 text-sm text-neutral-500">
              Thanks — we can now reach you at this address for sign-in and reset links.
            </p>
            <Link
              href="/"
              className="inline-block rounded-md bg-teal-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-teal-400"
            >
              Go to my meetings
            </Link>
          </>
        )}

        {outcome === "invalid" && (
          <>
            <h1 className="text-lg font-semibold text-white">Link didn&apos;t work</h1>
            <p className="mb-5 mt-2 text-sm text-neutral-500">
              This verification link is invalid, already used, or has expired. Request a new
              one below.
            </p>
            {signedIn ? (
              <ResendVerifyButton />
            ) : (
              <Link href="/login" className="text-sm text-teal-300 hover:text-teal-200">
                Sign in to get a new link
              </Link>
            )}
          </>
        )}

        {outcome === "pending" && (
          <>
            <h1 className="text-lg font-semibold text-white">Check your inbox</h1>
            <p className="mb-5 mt-2 text-sm text-neutral-500">
              {signedIn
                ? `We sent a confirmation link to ${signedIn.email}. Click it to finish setting up your account.`
                : "Open the link we emailed you, or sign in to have a fresh one sent."}
            </p>
            {signedIn && signedIn.emailVerified === false && <ResendVerifyButton />}
            <p className="mt-4 text-sm text-neutral-500">
              <Link href="/" className="text-teal-300 hover:text-teal-200">
                Continue anyway
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
