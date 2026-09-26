"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Props {
  mode: "login" | "signup";
}

/**
 * Email + password sign-in / registration.
 * POSTs to /api/auth/{login,signup}; on success the session cookie is set
 * httpOnly and we land on the dashboard.
 */
export default function AuthForm({ mode }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isSignup ? { name, email, password } : { email, password }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Try again.");
        setBusy(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error — check your connection.");
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-teal-500/60 focus:outline-none";
  const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500";

  return (
    <form onSubmit={submit} className="space-y-4">
      {isSignup && (
        <div>
          <label className={label} htmlFor="name">
            Name
          </label>
          <input
            id="name"
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            maxLength={80}
          />
        </div>
      )}

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

      <div>
        <label className={label} htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className={field}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={isSignup ? 8 : 1}
        />
        {isSignup && (
          <p className="mt-1 text-xs text-neutral-600">At least 8 characters.</p>
        )}
      </div>

      {error && (
        <p className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-teal-500 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-teal-400 disabled:opacity-60"
      >
        {busy ? "Working…" : isSignup ? "Create account" : "Sign in"}
      </button>

      <p className="text-center text-sm text-neutral-500">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-teal-300 hover:text-teal-200">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="text-teal-300 hover:text-teal-200">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
