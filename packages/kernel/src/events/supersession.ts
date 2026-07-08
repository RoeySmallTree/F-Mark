import type { AnyEventRecord } from "@f-mark/shared";

/**
 * Filenames an event supersedes. `supersedes` is `string` for most events;
 * a coalesced assistant message uses `string[]` to hide all the streamed
 * delta files it replaces. Empty entries are ignored.
 */
export function supersedesFilenames(event: AnyEventRecord): string[] {
  const value = (event.payload as { supersedes?: string | string[] }).supersedes;
  if (typeof value === "string") return value.length > 0 ? [value] : [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }
  return [];
}

export function applySupersession(events: AnyEventRecord[]): AnyEventRecord[] {
  const superseded = new Set<string>();
  for (const e of events) {
    for (const filename of supersedesFilenames(e)) superseded.add(filename);
  }
  return events.filter((e) => !superseded.has(e.filename));
}
