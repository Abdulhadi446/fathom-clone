import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AuthForm from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Sign in — Fathom" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 block text-center text-lg font-semibold tracking-tight text-white">
          Fathom
        </Link>
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-6">
          <h1 className="mb-1 text-lg font-semibold text-white">Sign in</h1>
          <p className="mb-5 text-sm text-neutral-500">
            Your meetings, transcripts and summaries are private to your account.
          </p>
          <AuthForm mode="login" />
        </div>
      </div>
    </main>
  );
}
