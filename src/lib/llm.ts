/**
 * Minimal OpenAI-compatible chat client.
 *
 * Defaults to the GitHub Copilot gateway (works with the OAuth token in the
 * dev environment) but is fully overridable through env vars so it can run
 * against any OpenAI-compatible endpoint:
 *
 *   LLM_API_KEY    - bearer token (REQUIRED for real LLM calls)
 *   LLM_API_BASE   - default https://api.githubcopilot.com
 *   LLM_API_PATH   - default /chat/completions
 *   LLM_MODEL      - default gpt-4o-mini
 *   LLM_INTEGRATION_ID - default copilot-chat (Copilot-only header)
 *
 * NEVER commit a real key. Values live in .env.local (gitignored) or in the
 * deployment environment.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

const DEFAULTS = {
  base: "https://api.githubcopilot.com",
  path: "/chat/completions",
  model: "gpt-4o-mini",
  integrationId: "copilot-chat",
};

export function llmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY);
}

export function llmModel(): string {
  return process.env.LLM_MODEL || DEFAULTS.model;
}

export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  const key = process.env.LLM_API_KEY;
  if (!key) throw new Error("LLM_API_KEY is not set");

  const base = (process.env.LLM_API_BASE || DEFAULTS.base).replace(/\/$/, "");
  const path = process.env.LLM_API_PATH || DEFAULTS.path;
  const url = path.startsWith("http") ? path : `${base}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const integrationId = process.env.LLM_INTEGRATION_ID || DEFAULTS.integrationId;
  if (integrationId) headers["Copilot-Integration-Id"] = integrationId;

  const body = {
    model: options.model || llmModel(),
    messages,
    temperature: options.temperature ?? 0.3,
    ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`LLM request failed ${res.status}: ${detail.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM returned no content");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

/** Ask the model for JSON and parse it tolerantly (strips fences, finds first {...}). */
export async function chatJSON<T>(messages: ChatMessage[], options: ChatOptions = {}): Promise<T> {
  const raw = await chat(messages, { ...options, temperature: options.temperature ?? 0.2 });
  return parseJsonLoose<T>(raw);
}

export function parseJsonLoose<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced ? fenced[1].trim() : "", trimmed];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try the next strategy */
    }
    const slice = firstBalancedObject(candidate);
    if (slice) {
      try {
        return JSON.parse(slice) as T;
      } catch {
        /* try the next strategy */
      }
    }
  }
  throw new Error(`Could not parse JSON from model output: ${trimmed.slice(0, 200)}`);
}

/** Extract the first {...} block, string-aware, so trailing prose is dropped. */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
