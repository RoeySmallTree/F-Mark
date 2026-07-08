import { useEffect, useMemo, useRef } from "react";
import type { AnyEventRecord } from "@f-mark/shared";
import {
  isStubMarker,
  projectFeed,
  type FeedInput,
  type FeedItem,
  type StubMarker,
} from "../feed/projectFeed.js";
import type { Aggregated, ConsumedStub } from "../state/aggregate.js";
import type { ViewMode } from "../state/store.js";
import { feedItemDomKey } from "./feedItemKeys.js";

const VIEW_MODE_DOCUMENT: ViewMode = "document";
const VIEW_MODE_CONVERSATION: ViewMode = "conversation";
const FEED_ITEM_TYPE_EVENT: "event" = "event";
const STUB_MARKER_TYPE: "stub" = "stub";

export interface FeedProjection {
  items: FeedItem[];
  freshKeys: ReadonlySet<string>;
  consumedFilenames: Set<string>;
}

export function useFeedProjection(
  agg: Aggregated,
  viewMode: ViewMode,
): FeedProjection {
  const projection = useMemo(() => {
    const slice = pickFeedSlice(agg, viewMode);
    if (viewMode === VIEW_MODE_DOCUMENT) {
      return { items: slice.map((event) => ({ type: FEED_ITEM_TYPE_EVENT, event })), slice };
    }
    if (viewMode === VIEW_MODE_CONVERSATION) {
      return { items: projectFeed(slice), slice };
    }
    // Default (everything) view owns the timeline: splice consumed-block stubs
    // into the chronological input before grouping, and elevate anchors that
    // gained same-turn appends so reading them clears the relit dot.
    const merged = mergeStubMarkers(slice, agg.consumedStubs);
    const items = attachAnchorReadKeys(
      projectFeed(merged),
      agg.anchorAdjacentReadKey,
    );
    return { items, slice };
  }, [agg, viewMode]);

  const consumedFilenames = useMemo(() => {
    const filenames = new Set<string>();
    for (const blocks of agg.consumedBlocksByAnchor.values()) {
      for (const block of blocks) filenames.add(block.filename);
    }
    return filenames;
  }, [agg.consumedBlocksByAnchor]);

  return {
    items: projection.items,
    freshKeys: useFreshFeedKeys(projection.items),
    consumedFilenames,
  };
}

function pickFeedSlice(agg: Aggregated, viewMode: ViewMode) {
  if (viewMode === VIEW_MODE_DOCUMENT) return agg.feedDocument;
  if (viewMode === VIEW_MODE_CONVERSATION) return agg.feedConversation;
  return agg.feed;
}

/* Splice stub markers into the sorted feed slice at each block run's slot,
   using the SAME (timestamp, filename) ordering the aggregate sorted by, so a
   stub lands exactly where its consumed block used to sit. Block filenames are
   never in the feed slice, so markers never collide with a real row. */
function mergeStubMarkers(
  slice: AnyEventRecord[],
  stubs: ConsumedStub[],
): FeedInput[] {
  if (stubs.length === 0) return slice;
  const markers: StubMarker[] = stubs.map((stub) => ({
    type: STUB_MARKER_TYPE,
    stub,
    sortKey: stub.newestBlockFilename,
  }));
  return [...slice, ...markers].sort((a, b) => {
    const t = inputTimestamp(a).localeCompare(inputTimestamp(b));
    return t !== 0 ? t : inputFilename(a).localeCompare(inputFilename(b));
  });
}

function inputTimestamp(input: FeedInput): string {
  return isStubMarker(input)
    ? input.sortKey.split("_")[0] ?? input.sortKey
    : input.timestamp;
}

function inputFilename(input: FeedInput): string {
  return isStubMarker(input) ? input.sortKey : input.filename;
}

/* Elevate a named anchor's feed read key to its newest same-turn (adjacent)
   append. There are no rendered rows between the anchor and those blocks, so
   advancing the key can't mis-mark anything — it just lets the relit dot clear
   once the anchor is read. Non-adjacent appends ride their own stub instead. */
function attachAnchorReadKeys(
  items: FeedItem[],
  anchorAdjacentReadKey: Map<string, string>,
): FeedItem[] {
  if (anchorAdjacentReadKey.size === 0) return items;
  return items.map((item) => {
    if (item.type !== FEED_ITEM_TYPE_EVENT) return item;
    const adjacent = anchorAdjacentReadKey.get(item.event.filename);
    if (adjacent === undefined) return item;
    return {
      ...item,
      rowReadKey:
        adjacent > item.event.filename ? adjacent : item.event.filename,
    };
  });
}

function useFreshFeedKeys(items: FeedItem[]): ReadonlySet<string> {
  const seenKeysRef = useRef<string[] | null>(null);

  const freshKeys = useMemo(
    () => calculateFreshKeys(items, seenKeysRef.current),
    [items],
  );

  useEffect(() => {
    seenKeysRef.current = items.map(feedItemDomKey);
  }, [items]);

  return freshKeys;
}

function calculateFreshKeys(
  items: FeedItem[],
  previousKeys: string[] | null,
): ReadonlySet<string> {
  const fresh = new Set<string>();
  // No prior content — the initial app render, or the moment just after a
  // session switch cleared the feed and a whole batch loaded in. Marking that
  // batch "fresh" fires the word-reveal scramble + row enter-motion on every
  // item at once, churning the DOM for ~1.5s and making session-open feel slow.
  // Only animate genuine live appends ONTO already-rendered content.
  if (previousKeys === null || previousKeys.length === 0) return fresh;
  if (items.length <= previousKeys.length) return fresh;
  for (let i = 0; i < previousKeys.length; i++) {
    if (feedItemDomKey(items[i]!) !== previousKeys[i]) return fresh;
  }
  for (let i = previousKeys.length; i < items.length; i++) {
    fresh.add(feedItemDomKey(items[i]!));
  }
  return fresh;
}
