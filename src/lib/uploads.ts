import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Meeting audio lives outside the build so it survives deploys:
 *   local   -> ./data/uploads
 *   server  -> $UPLOAD_DIR (/srv/fathom/data/uploads)
 */
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");

export const MAX_AUDIO_BYTES = 80 * 1024 * 1024;

const EXT_TYPES: Record<string, string> = {
  webm: "audio/webm",
  mp4: "audio/mp4",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  wav: "audio/wav",
  x: "application/octet-stream",
};

export function contentTypeFor(filename: string): string {
  const ext = path.extname(filename).replace(".", "").toLowerCase();
  return EXT_TYPES[ext] ?? EXT_TYPES.x;
}

export type SaveResult = { ok: true; filename: string } | { ok: false; error: string };

function safeExt(file: File): string {
  const ext = path.extname(file.name || "").replace(".", "").toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "webm";
}

/** Persist an uploaded/recorder audio blob as `<meetingId>.<ext>`. */
export async function saveMeetingAudio(meetingId: string, file: File): Promise<SaveResult> {
  if (file.size > MAX_AUDIO_BYTES) {
    return { ok: false, error: "Audio file is larger than 80 MB." };
  }
  if (file.size === 0) return { ok: false, error: "Audio file is empty." };

  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `${meetingId}.${safeExt(file)}`;
  const target = path.join(UPLOAD_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fsp.writeFile(target, buffer);
  return { ok: true, filename };
}

/** Resolve a stored `Meeting.audio_path` to an absolute file, or null. */
export function resolveAudioPath(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const base = path.basename(filename); // never trust a path from the DB
  const full = path.join(UPLOAD_DIR, base);
  try {
    return fs.existsSync(full) ? full : null;
  } catch {
    return null;
  }
}

export async function removeMeetingAudio(filename: string | null | undefined) {
  const full = resolveAudioPath(filename);
  if (full) await fsp.unlink(full).catch(() => undefined);
}
