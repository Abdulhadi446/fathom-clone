export const SAMPLE_TITLE = "Sprint 42 — release sync";

export const SAMPLE_TRANSCRIPT = `00:00 Priya: short one today — we need to lock the search fix and the export copy.
00:14 Marcus: search PR is approved. I can ship it once the transcription worker is green.
00:29 Sam: it failed twice last night. I'll add retry with backoff today and watch it.
00:41 Lena: transcript UI is done except virtualization on long meetings, Friday at the latest.
00:55 Priya: ok, search ships Thursday. Marcus, you own the deploy notes.
01:03 Grace: on the export copy, legal replied — we can say "meeting recap" not "recording".
01:17 Priya: fine, ship the copy change with the Thursday release.
01:24 Ibrahim: the search quality eval is running, I'll have numbers by Monday.
01:33 Sam: reminder that storage costs jumped 18% — we should cap raw audio at 30 days.
01:47 Priya: decision — 30 day retention for raw audio, 12 months for transcripts.
01:58 Marcus: I'll open the ticket for the retention job and tag infra on it.
02:06 Priya: action items then — Marcus sends deploy notes by Thursday, Sam lands the retention job by next Tuesday.
02:14 Grace: and I'll post the updated export copy in the channel today.
02:20 Priya: great, that's everything — thanks everyone.`;
