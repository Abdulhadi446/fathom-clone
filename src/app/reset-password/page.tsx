import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/PasswordForms";

export const metadata: Metadata = { title: "Reset password — Fathom" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 block text-center text-lg font-semibold tracking-tight text-white">
          Fathom
        </Link>
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-6">
          <h1 className="mb-1 text-lg font-semibold text-white">Choose a new password</h1>
          <p className="mb-5 text-sm text-neutral-500">
            Every session will be signed out once the password changes.
          </p>
          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <p className="text-sm text-neutral-400">
              This page needs a reset link.{" "}
              <Link href="/forgot-password" className="text-teal-300 hover:text-teal-200">
                Request a new one
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
