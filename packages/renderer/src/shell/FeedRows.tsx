import type { CSSProperties, JSX } from "react";
import { isNamedAnchor, type Participant } from "@f-mark/shared";
import { ArbitraryGroupCard } from "../cards/ArbitraryGroupCard.js";
import { EventCard } from "../cards/EventCard.js";
import type { ConsumedStub } from "../state/aggregate.js";
import type { FeedItem } from "../feed/projectFeed.js";
import type { Aggregated } from "../state/aggregate.js";
import { flashAnchor } from "./anchorFlash.js";
import { cssEscape, feedItemDomKey, feedItemReadKey } from "./feedItemKeys.js";

const NO_LOOSE_STRING_VALUES = {
  group: "group",
  stub: "stub",
  event: "event",
  feedItem: "feed-item",
  i: "--i",
} as const;

/* The anchor dot lights for ANY consumed block (adjacent or not), so its key
   is max(own, newest of all consumed blocks) — one notch above the row read
   key, which only counts same-turn appends. Non-anchor rows relight normally. */
function feedItemUnreadKey(item: FeedItem, agg: Aggregated): string {
  const readKey = feedItemReadKey(item);
  if (item.type !== NO_LOOSE_STRING_VALUES.event || !isNamedAnchor(item.event)) {
    return readKey;
  }
  const blocks = agg.consumedBlocksByAnchor.get(item.event.filename);
  if (blocks === undefined) return readKey;
  let newest = readKey;
  for (const block of blocks) {
    if (block.filename > newest) newest = block.filename;
  }
  return newest;
}

/* Scroll to the live anchor card and flash it. Targets `data-event-filename`
   (always the event's OWN filename) rather than the read key, mirroring the
   comment/cmdk jump pattern. */
function jumpToAnchor(anchorFilename: string): void {
  const target = document.querySelector<HTMLElement>(
    `[data-event-filename="${cssEscape(anchorFilename)}"]`,
  );
  if (target === null) return;
  flashAnchor(target);
}

export function FeedRows({
  items,
  freshKeys,
  savedAnchor,
  exitingDots,
  participants,
  agg,
  consumedFilenames,
}: {
  items: FeedItem[];
  freshKeys: ReadonlySet<string>;
  savedAnchor: string | undefined;
  exitingDots: ReadonlySet<string>;
  participants: Record<string, Participant>;
  agg: Aggregated;
  consumedFilenames: Set<string>;
}): JSX.Element {
  return (
    <>
      {items.map((item, idx) => (
        <FeedRow
          key={feedItemDomKey(item)}
          item={item}
          index={idx}
          isFresh={freshKeys.has(feedItemDomKey(item))}
          savedAnchor={savedAnchor}
          exitingDots={exitingDots}
          participants={participants}
          agg={agg}
          consumedFilenames={consumedFilenames}
        />
      ))}
    </>
  );
}

function FeedRow({
  item,
  index,
  isFresh,
  savedAnchor,
  exitingDots,
  participants,
  agg,
  consumedFilenames,
}: {
  item: FeedItem;
  index: number;
  isFresh: boolean;
  savedAnchor: string | undefined;
  exitingDots: ReadonlySet<string>;
  participants: Record<string, Participant>;
  agg: Aggregated;
  consumedFilenames: Set<string>;
}): JSX.Element {
  const readKey = feedItemReadKey(item);
  const unreadKey = feedItemUnreadKey(item, agg);
  const isUnread = savedAnchor !== undefined && unreadKey > savedAnchor;
  const isExiting = exitingDots.has(readKey);
  const motionStyle = isFresh ? feedMotionStyle(index) : undefined;

  if (item.type === NO_LOOSE_STRING_VALUES.group) {
    return (
      <GroupFeedRow
        group={item}
        groupId={feedItemDomKey(item)}
        readKey={readKey}
        isFresh={isFresh}
        isUnread={isUnread}
        isExiting={isExiting}
        motionStyle={motionStyle}
        participants={participants}
        allEvents={agg.events}
      />
    );
  }

  if (item.type === NO_LOOSE_STRING_VALUES.stub) {
    return (
      <StubFeedRow
        stub={item.stub}
        readKey={readKey}
        isFresh={isFresh}
        isUnread={isUnread}
        isExiting={isExiting}
        motionStyle={motionStyle}
      />
    );
  }

  return (
    <EventFeedRow
      event={item.event}
      readKey={readKey}
      isFresh={isFresh}
      isUnread={isUnread}
      isExiting={isExiting}
      motionStyle={motionStyle}
      participants={participants}
      agg={agg}
      consumedFilenames={consumedFilenames}
    />
  );
}

function GroupFeedRow({
  group,
  groupId,
  readKey,
  isFresh,
  isUnread,
  isExiting,
  motionStyle,
  participants,
  allEvents,
}: {
  group: Extract<FeedItem, { type: "group" }>;
  groupId: string;
  readKey: string;
  isFresh: boolean;
  isUnread: boolean;
  isExiting: boolean;
  motionStyle: CSSProperties | undefined;
  participants: Record<string, Participant>;
  allEvents: Aggregated["events"];
}): JSX.Element {
  return (
    <div
      data-event-filename={readKey}
      data-feed-read-key={readKey}
      data-participant-id={group.participant_id}
      className={feedItemClassName({ isFresh, isUnread })}
      style={motionStyle}
    >
      <UnreadDot visible={isUnread || isExiting} exiting={isExiting && !isUnread} />
      <ArbitraryGroupCard
        group={group}
        groupId={groupId}
        participants={participants}
        allEvents={allEvents}
      />
    </div>
  );
}

function EventFeedRow({
  event,
  readKey,
  isFresh,
  isUnread,
  isExiting,
  motionStyle,
  participants,
  agg,
  consumedFilenames,
}: {
  event: Extract<FeedItem, { type: "event" }>["event"];
  readKey: string;
  isFresh: boolean;
  isUnread: boolean;
  isExiting: boolean;
  motionStyle: CSSProperties | undefined;
  participants: Record<string, Participant>;
  agg: Aggregated;
  consumedFilenames: Set<string>;
}): JSX.Element {
  const isOrphan = agg.orphanBlocks.has(event.filename);
  return (
    <div
      data-event-filename={event.filename}
      data-feed-read-key={readKey}
      data-orphan-embed={isOrphan ? "true" : undefined}
      data-participant-id={event.participant_id}
      className={feedItemClassName({ isFresh, isUnread, isOrphan })}
      style={motionStyle}
    >
      <UnreadDot visible={isUnread || isExiting} exiting={isExiting && !isUnread} />
      {isOrphan && (
        <div className="orphan-embed-badge" role="note">
          orphaned embed — append_to points at a missing anchor
        </div>
      )}
      <EventCard
        event={event}
        participants={participants}
        comments={agg.commentsByTarget.get(event.filename) ?? []}
        allEvents={agg.events}
        revealWords={isFresh}
        consumedFilenames={consumedFilenames}
        blocks={
          isNamedAnchor(event)
            ? agg.consumedBlocksByAnchor.get(event.filename) ?? []
            : undefined
        }
        commentsByFilename={isNamedAnchor(event) ? agg.commentsByTarget : undefined}
      />
    </div>
  );
}

function StubFeedRow({
  stub,
  readKey,
  isFresh,
  isUnread,
  isExiting,
  motionStyle,
}: {
  stub: ConsumedStub;
  readKey: string;
  isFresh: boolean;
  isUnread: boolean;
  isExiting: boolean;
  motionStyle: CSSProperties | undefined;
}): JSX.Element {
  const docName = stub.docName.trim().length > 0 ? stub.docName : "a document";
  // No data-event-filename: nothing scrolls TO a stub, and omitting it avoids
  // colliding with the folded-in block's inline data-event-filename.
  return (
    <div
      data-feed-read-key={readKey}
      className={feedItemClassName({ isFresh, isUnread }) + " feed-item-stub"}
      style={motionStyle}
    >
      <UnreadDot visible={isUnread || isExiting} exiting={isExiting && !isUnread} />
      <button
        type="button"
        className="feed-consumed-stub"
        onClick={() => jumpToAnchor(stub.anchorFilename)}
        title={`Jump to ${docName}`}
      >
        <span className="feed-consumed-stub-text">
          Added to <span className="feed-consumed-stub-doc">{docName}</span>
        </span>
        <span className="feed-consumed-stub-jump" aria-hidden>
          jump ↑
        </span>
      </button>
    </div>
  );
}

function UnreadDot({
  visible,
  exiting,
}: {
  visible: boolean;
  exiting: boolean;
}): JSX.Element | null {
  if (!visible) return null;
  return (
    <span
      className={"feed-item-unread-dot" + (exiting ? " exiting" : "")}
      aria-hidden
    />
  );
}

function feedItemClassName({
  isFresh,
  isUnread,
  isOrphan = false,
}: {
  isFresh: boolean;
  isUnread: boolean;
  isOrphan?: boolean;
}): string {
  return (
    NO_LOOSE_STRING_VALUES.feedItem +
    (isOrphan ? " feed-item-orphan" : "") +
    (isFresh ? " is-fresh" : "") +
    (isUnread ? " is-unread" : "")
  );
}

function feedMotionStyle(index: number): CSSProperties {
  return {
    [NO_LOOSE_STRING_VALUES.i as string]: Math.min(index, 7),
  };
}
