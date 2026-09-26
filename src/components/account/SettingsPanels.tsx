"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const field =
  "w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-teal-500/60 focus:outline-none";
const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500";
const button =
  "rounded-md bg-teal-500 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-teal-400 disabled:opacity-60";

function Notice({ kind, children }: { kind: "ok" | "err"; children: React.ReactNode }) {
  return (
    <p
      className={`rounded border px-3 py-2 text-sm ${
        kind === "ok"
          ? "border-teal-500/30 bg-teal-500/10 text-teal-200"
          : "border-red-500/30 bg-red-500/10 text-red-300"
      }`}
    >
      {children}
    </p>
  );
}

/** POST /api/auth/resend-verification */
export function ResendVerifyButton() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = (await res.json().catch(() => null)) as { error?: string; sent?: boolean } | null;
      if (!res.ok) setNote({ kind: "err", text: data?.error ?? "Could not send the email." });
      else if (data?.sent) setNote({ kind: "ok", text: "Verification email sent." });
      else setNote({ kind: "err", text: "The mail server refused the message." });
    } catch {
      setNote({ kind: "err", text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={send} disabled={busy} className={button}>
        {busy ? "Sending…" : "Send verification email"}
      </button>
      {note && <Notice kind={note.kind}>{note.text}</Notice>}
    </div>
  );
}

/** POST /api/auth/change-password */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setNote(null);
    if (next !== confirm) {
      setNote({ kind: "err", text: "New passwords don't match." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) setNote({ kind: "err", text: data?.error ?? "Could not change the password." });
      else {
        setNote({ kind: "ok", text: "Password updated." });
        setCurrent("");
        setNext("");
        setConfirm("");
      }
    } catch {
      setNote({ kind: "err", text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className={label} htmlFor="current">
          Current password
        </label>
        <input
          id="current"
          type="password"
          className={field}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div>
        <label className={label} htmlFor="next">
          New password
        </label>
        <input
          id="next"
          type="password"
          className={field}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
        />
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
      {note && <Notice kind={note.kind}>{note.text}</Notice>}
      <button type="submit" disabled={busy} className={button}>
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}

/** DELETE /api/account — irreversible, password confirmed, typed confirmation. */
export function DeleteAccountForm({ email }: { email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = typed.trim().toLowerCase() === email.toLowerCase() && password.length > 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setNote(data?.error ?? "Could not delete the account.");
        setBusy(false);
        return;
      }
      router.replace("/signup?deleted=1");
      router.refresh();
    } catch {
      setNote("Network error.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-neutral-400">
        Deletes your account, every meeting, transcript, summary, highlight and uploaded
        recording. This cannot be undone.
      </p>
      <div>
        <label className={label} htmlFor="confirm-email">
          Type your email to confirm
        </label>
        <input
          id="confirm-email"
          type="email"
          className={field}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={email}
          autoComplete="off"
          required
        />
      </div>
      <div>
        <label className={label} htmlFor="confirm-password">
          Your password
        </label>
        <input
          id="confirm-password"
          type="password"
          className={field}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      {note && <Notice kind="err">{note}</Notice>}
      <button
        type="submit"
        disabled={!ready || busy}
        className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete my account"}
      </button>
      {!ready && (
        <p className="text-xs text-neutral-600">
          Enter <span className="text-neutral-400">{email}</span> and your password to enable
          the button.
        </p>
      )}
      <p className="text-xs text-neutral-600">
        Need a copy first?{" "}
        <Link href="/" className="text-teal-300 hover:text-teal-200">
          Back to meetings
        </Link>
      </p>
    </form>
  );
}
