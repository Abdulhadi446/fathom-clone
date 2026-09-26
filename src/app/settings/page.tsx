import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  ChangePasswordForm,
  DeleteAccountForm,
  ResendVerifyButton,
} from "@/components/account/SettingsPanels";

export const metadata: Metadata = { title: "Account — Fathom" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings");

  const card = "rounded-lg border border-neutral-800 bg-neutral-950/60 p-6";
  const heading = "text-base font-semibold text-white";

  return (
    <main className="mx-auto w-full max-w-2xl py-10">
      <h1 className="mb-1 text-xl font-semibold text-white">Account</h1>
      <p className="mb-8 text-sm text-neutral-500">
        Signed in as <span className="text-neutral-300">{user.email}</span>
      </p>

      <div className="space-y-6">
        <section className={card}>
          <h2 className={heading}>Email</h2>
          <p className="mt-2 text-sm text-neutral-400">
            {user.emailVerified
              ? `${user.email} is confirmed.`
              : `${user.email} has not been confirmed yet. We send sign-in and reset links here.`}
          </p>
          {!user.emailVerified && (
            <div className="mt-4">
              <ResendVerifyButton />
            </div>
          )}
        </section>

        <section className={card}>
          <h2 className={heading}>Change password</h2>
          <div className="mt-4">
            <ChangePasswordForm />
          </div>
        </section>

        <section className={`${card} border-red-500/20`}>
          <h2 className={heading}>Delete account</h2>
          <div className="mt-4">
            <DeleteAccountForm email={user.email} />
          </div>
        </section>

        <p className="text-sm text-neutral-600">
          <Link href="/" className="text-teal-300 hover:text-teal-200">
            ← Back to meetings
          </Link>
        </p>
      </div>
    </main>
  );
}
