"use client";

/**
 * PROPS CONTRACT — foundation-issued, do not change the shape.
 *
 * Owner: agent C (sharing + highlights).
 * Consumer: agent A (meeting detail page), which renders this inside
 * `/meetings/[id]` and passes its playback + selection state.
 *
 * Agent A: render it like this —
 *
 *   <HighlightBar
 *     meetingId={meeting.id}
 *     durationSeconds={meeting.durationSeconds}
 *     currentTime={currentTime}                 // seconds from the <audio> element
 *     selection={selection}                     // null when nothing is selected
 *   />
 *
 * `selection` = { start, end, text } in seconds (from the transcript line the
 * user selected, or a range spanning several lines). Agent C implements saving,
 * the highlight list and share toggling inside this component; agent A only
 * supplies state.
 *
 * The `/api/highlights` endpoints are owned by agent C.
 */

export interface HighlightSelection {
  start: number;
  end: number;
  text: string;
}

export interface HighlightBarProps {
  meetingId: string;
  durationSeconds: number;
  currentTime: number;
  selection: HighlightSelection | null;
}

export default function HighlightBar(_props: HighlightBarProps) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-800 p-3 text-xs text-neutral-500">
      Highlight tools load here.
    </div>
  );
}
