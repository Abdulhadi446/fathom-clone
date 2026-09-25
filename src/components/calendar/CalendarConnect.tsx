"use client";

import { useEffect, useRef, useState } from "react";
import ProviderMark from "./ProviderMark";

type Provider = "google" | "outlook";

interface InitialState {
  provider: string | null;
  connected: boolean;
  user: { id: string; name: string; email: string };
}

const PROVIDERS: { id: Provider; name: string; blurb: string }[] = [
  {
    id: "google",
    name: "Google Calendar",
    blurb:
      "Read-only access to upcoming events so meetings are captured and titled automatically.",
  },
  {
    id: "outlook",
    name: "Microsoft Outlook",
    blurb:
      "Microsoft 365 calendar access — joins scheduled calls and pulls the attendee list.",
  },
];

/** Simulated OAuth handshake steps — STUB, nothing here talks to a provider. */
const STEPS = [
  "Opening provider…",
  "Requesting scopes…",
  "Syncing next 30 days…",
];
const STEP_MS = 400; // 3 steps → ~1.2 s total, as specified

const UPCOMING = [
  { day: "Thu 10:00", len: "30 min", title: "Design sync — mobile onboarding", who: "Grace, Lena" },
  { day: "Thu 14:00", len: "45 min", title: "Acme Corp — security review", who: "Dana, Tom" },
  { day: "Mon 09:30", len: "60 min", title: "Sprint 43 planning", who: "Priya + 5" },
];

function toProvider(value: string | null): Provider | null {
  return value === "google" || value === "outlook" ? value : null;
}

export default function CalendarConnect({ initial }: { initial: InitialState }) {
  const [connected, setConnected] = useState(initial.connected);
  const [provider, setProvider] = useState<Provider | null>(toProvider(initial.provider));
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [step, setStep] = useState(0);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  async function connect(next: Provider) {
    if (connecting) return;
    setError(null);
    setConnecting(next);
    setStep(0);

    const started = Date.now();
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = STEPS.map((_, i) =>
      window.setTimeout(() => setStep(i), i * STEP_MS),
    );

    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", provider: next }),
      });
      if (!res.ok) throw new Error(`connect failed (${res.status})`);
      const wait = Math.max(0, STEP_MS * STEPS.length - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      setProvider(next);
      setConnected(true);
    } catch {
      setError("Couldn't reach the calendar service. Try connecting again.");
    } finally {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current = [];
      setConnecting(null);
      setStep(0);
    }
  }

  async function disconnect() {
    if (disconnecting) return;
    setError(null);
    setDisconnecting(true);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      if (!res.ok) throw new Error(`disconnect failed (${res.status})`);
      await new Promise((r) => setTimeout(r, 350));
      setConnected(false);
      setProvider(null);
    } catch {
      setError("Couldn't update the connection. Try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  if (connecting) {
    const active = PROVIDERS.find((p) => p.id === connecting)!;
    return (
      <section className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-5">
        <div className="flex items-start gap-3">
          <ProviderMark provider={connecting} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Connecting to {active.name}</h2>
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                Demo
              </span>
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              Simulated handshake — no provider is actually contacted.
            </p>

            <ol className="mt-4 space-y-2.5">
              {STEPS.map((label, i) => {
                const done = i < step;
                const activeStep = i === step;
                return (
                  <li key={label} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[10px] ${
                        done
                          ? "border-teal-400/60 bg-teal-400/15 text-teal-300"
                          : activeStep
                            ? "border-neutral-600 text-transparent"
                            : "border-neutral-800 text-transparent"
                      }`}
                    >
                      {done ? "✓" : "•"}
                    </span>
                    <span className={done || activeStep ? "text-neutral-200" : "text-neutral-600"}>
                      {label}
                    </span>
                    {activeStep && (
                      <span className="ml-1 h-3 w-3 animate-spin rounded-full border border-neutral-600 border-t-teal-300" />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>
    );
  }

  if (connected && provider) {
    const active = PROVIDERS.find((p) => p.id === provider)!;
    return (
      <div className="space-y-4">
        <section className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-5">
          <div className="flex flex-wrap items-start gap-3">
            <ProviderMark provider={provider} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                  <span className="h-2 w-2 rounded-full bg-teal-400" />
                  Connected
                </span>
                <span className="text-sm text-neutral-400">{active.name}</span>
                <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                  Demo
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">
                {initial.user.name} · {initial.user.email} · scopes: calendar.readonly,
                calendar.events
              </p>
            </div>
            <button
              type="button"
              onClick={disconnect}
              disabled={disconnecting}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-900 disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>

          <div className="mt-4 rounded-lg border border-neutral-800/80 bg-neutral-900/50 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                3 upcoming meetings detected (simulated)
              </p>
              <span className="text-[10px] text-neutral-600">next 30 days</span>
            </div>
            <ul className="mt-2.5 divide-y divide-neutral-800/80">
              {UPCOMING.map((m) => (
                <li key={m.title} className="flex items-baseline gap-3 py-2 text-sm">
                  <span className="w-24 shrink-0 font-mono text-xs text-teal-300/90">{m.day}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-200">{m.title}</span>
                  <span className="hidden shrink-0 text-xs text-neutral-500 sm:inline">
                    {m.who}
                  </span>
                  <span className="w-14 shrink-0 text-right text-xs text-neutral-600">{m.len}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-neutral-600">
            Stubbed for the demo: the handshake, scope request and event sync above are
            simulated, and only the connection flag on the demo user row is persisted.
          </p>
        </section>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {PROVIDERS.map((p) => (
          <section
            key={p.id}
            className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-950/70 p-4"
          >
            <div className="flex items-center gap-3">
              <ProviderMark provider={p.id} />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-white">{p.name}</h2>
                <p className="text-[11px] uppercase tracking-wide text-neutral-600">
                  OAuth 2.0 · read-only
                </p>
              </div>
            </div>
            <p className="mt-3 flex-1 text-xs leading-relaxed text-neutral-500">{p.blurb}</p>
            <button
              type="button"
              onClick={() => connect(p.id)}
              className="mt-4 w-full rounded-md bg-teal-400 px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-teal-300"
            >
              Connect
            </button>
          </section>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-neutral-600">
        <span className="mr-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
          Demo
        </span>
        Connection is stubbed — no real OAuth flow or provider API calls. Connecting stores a
        flag on the demo user so the rest of the app behaves as if the calendar were linked.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
