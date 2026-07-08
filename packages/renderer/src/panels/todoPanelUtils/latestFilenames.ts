import type { AnyEventRecord, TodoPayload } from "@f-mark/shared";
import { sortedTodoEvents, supersededTodoFilenames } from "./todoRecords.js";

export function latestTodoFilenames(
  events: AnyEventRecord[],
): Map<string, string> {
  const latest = new Map<string, string>();
  const todoEvents = sortedTodoEvents(events);
  const superseded = supersededTodoFilenames(todoEvents);
  for (const event of todoEvents) {
    if (superseded.has(event.filename)) continue;
    const payload = event.payload as TodoPayload;
    latest.set(payload.id, event.filename);
  }
  return latest;
}
