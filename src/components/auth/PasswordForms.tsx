"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const field =
  "w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-teal-500/60 focus:outline-none";
const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500";
const primary =
  "w-full rounded-md bg-teal-500 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-teal-400 disabled:opacity-60";

/** POST /api/auth/forgot-password — asks for a reset link. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) setError(data?.error ?? "Something went wrong. Try again.");
      else setMessage(data?.message ?? "If that address has an account, a reset link is on its way.");
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className={label} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          className={field}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </div>
      {error && (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      )}
      {message && (
        <p className="rounded border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm text-teal-200">{message}</p>
      )}
      <button type="submit" disabled={busy} className={primary}>
        {busy ? "Sending…" : "Email me a reset link"}
      </button>
      <p className="text-center text-sm text-neutral-500">
        <Link href="/login" className="text-teal-300 hover:text-teal-200">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

/** POST /api/auth/reset-password — set a new password from an emailed link. */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "This reset link is invalid or has expired.");
        setBusy(false);
        return;
      }
      router.replace("/login?reset=1");
      router.refresh();
    } catch {
      setError("Network error — check your connection.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className={label} htmlFor="password">
          New password
        </label>
        <input
          id="password"
          type="password"
          className={field}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
        />
        <p className="mt-1 text-xs text-neutral-600">At least 8 characters.</p>
      </div>
      <div>
        <label className={label} htmlFor="confirm">
          Confirm new password
        </label>
        <input
          id="confirm"
          type="password"
          className={field}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>
      {error && (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      )}
      <button type="submit" disabled={busy} className={primary}>
        {busy ? "Saving…" : "Set new password"}
      </button>
      <p className="text-center text-sm text-neutral-500">
        <Link href="/login" className="text-teal-300 hover:text-teal-200">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
