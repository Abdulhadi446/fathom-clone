"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/", label: "Meetings" },
  { href: "/calendar", label: "Calendar" },
  { href: "/ingest", label: "Add meeting" },
];

export interface NavUser {
  name: string;
  email: string;
  emailVerified?: boolean;
}

function initialsOf(name: string, email: string) {
  const fromName = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return fromName || email.slice(0, 2).toUpperCase();
}

export default function Nav({ user }: { user: NavUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setBusy(false);
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800/80 bg-[#0a0a0b]/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-400 text-[13px] font-bold text-black">
            F
          </span>
          Fathom
        </Link>

        {user && (
          <nav className="flex items-center gap-1">
            {LINKS.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/" || pathname.startsWith("/meetings")
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-neutral-800 text-white"
                      : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              {user.emailVerified === false && (
                <Link
                  href="/verify-email"
                  className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20"
                >
                  Verify email
                </Link>
              )}
              <Link
                href="/settings"
                className="hidden text-right text-xs leading-tight transition-colors hover:text-white sm:block"
                title="Account settings"
              >
                <div className="text-neutral-300">{user.name}</div>
                <div className="text-neutral-600">{user.email}</div>
              </Link>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-500/15 text-[11px] font-semibold text-teal-200 ring-1 ring-teal-400/30">
                {initialsOf(user.name, user.email)}
              </div>
              <button
                type="button"
                onClick={signOut}
                disabled={busy}
                className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-400 transition hover:border-neutral-500 hover:text-neutral-200 disabled:opacity-60"
              >
                {busy ? "…" : "Sign out"}
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-teal-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-teal-400"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
