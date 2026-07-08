import { type JSX } from "react";
import { renderContentEvent } from "./contentDispatch.js";
import { renderProseEvent } from "./proseDispatch.js";
import { renderSystemEvent } from "./systemDispatch.js";
import type { EventCardProps } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  prose: "prose",
} as const;

export function renderEventCard(props: EventCardProps): JSX.Element | null {
  if (isConsumedBlock(props)) return null;

  /* Orphan signal for non-prose blocks: any non-prose event carrying
     `append_to` whose live anchor isn't in `consumedFilenames` is an
     orphan. Card variants do not currently render an orphan badge, so the
     signal is kept local here. */

  if (props.event.kind === NO_LOOSE_STRING_VALUES.prose) return renderProseEvent(props);
  return renderContentEvent(props) ?? renderSystemEvent(props) ?? null;
}

function isConsumedBlock(props: EventCardProps): boolean {
  return props.consumedFilenames?.has(props.event.filename) ?? false;
}
