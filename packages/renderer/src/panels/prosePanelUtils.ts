import type { KeyboardEvent } from "react";
import type { AnyEventRecord, Participant, ProsePayload } from "@f-mark/shared";

export function prosePayloadOf(event: AnyEventRecord): ProsePayload {
  return event.payload as ProsePayload;
}

export function participantName(
  participants: Record<string, Participant>,
  participantId: string,
): string {
  return participants[participantId]?.name ?? participantId;
}

export function eventDomKey(
  path: string,
  sessionId: string,
  filename: string,
): string {
  return `${path}:${sessionId}:${filename}`;
}

export function jumpToEvent(filename: string): void {
  const element = document.querySelector(`[data-event-filename="${filename}"]`);
  if (element !== null) {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function activateEventOnKey(
  event: KeyboardEvent,
  filename: string,
): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  jumpToEvent(filename);
}
