import type { FeedItem } from "../feed/projectFeed.js";

const NO_LOOSE_STRING_VALUES = {
  group: "group",
  stub: "stub",
} as const;

export function feedItemDomKey(item: FeedItem): string {
  if (item.type === NO_LOOSE_STRING_VALUES.group) {
    return `grp-${item.items[0]!.filename}`;
  }
  if (item.type === NO_LOOSE_STRING_VALUES.stub) {
    return `stub-${item.stub.newestBlockFilename}`;
  }
  return item.event.filename;
}

/** The feed row's read/position key — what the read-tracking observer,
 *  unread counters, and step navigation compare against `savedAnchor`.
 *  A named anchor with same-turn appends carries an elevated `rowReadKey`
 *  so reading it clears the append; a stub carries its newest block. */
export function feedItemReadKey(item: FeedItem): string {
  if (item.type === NO_LOOSE_STRING_VALUES.group) {
    return item.items[item.items.length - 1]!.filename;
  }
  if (item.type === NO_LOOSE_STRING_VALUES.stub) {
    return item.stub.newestBlockFilename;
  }
  return item.rowReadKey ?? item.event.filename;
}

/* Use the platform CSS.escape when available so weird filename
   characters can't break the attribute selector. */
export function cssEscape(s: string): string {
  const esc = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS
    ?.escape;
  return typeof esc === "function" ? esc(s) : s.replace(/"/g, '\\"');
}
