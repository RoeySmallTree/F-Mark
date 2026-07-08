const NO_LOOSE_STRING_VALUES = {
  streaming: "streaming",
} as const;

/* ArbitraryGroupCard — expandable collapsible group containing arbitrary
   prose + tool-use items emitted mid-turn by the same participant.

   The kernel emits these events as they stream in. We bundle a contiguous
   run for one participant into a single "group" (see `projectFeed`) so the
   feed doesn't drown the reader in raw tool calls while a turn is still
   unfolding. Status tracks the lifecycle:

     streaming  → turn is still in flight; OPEN by default; title shows
                  elapsed-since-start and a "live" badge
     concluded  → followed by a named/unnamed prose from the same agent;
                  COLLAPSED by default
     ended      → turn-end seen before any concluding prose; COLLAPSED

   Clicking the header toggles open/closed regardless of status. The body
   delegates to `<EventCard>` for each child item, so prose/tool-use rendering
   stays consistent with the rest of the feed. */

import { useEffect, useRef, useState, type JSX } from "react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import type { ArbitraryGroup } from "../feed/projectFeed.js";
import { ArbitraryGroupBody } from "./arbitraryGroup/ArbitraryGroupBody.js";
import { ArbitraryGroupHeader } from "./arbitraryGroup/ArbitraryGroupHeader.js";
import { ArbitraryGroupPreview } from "./arbitraryGroup/ArbitraryGroupPreview.js";
import { buildArbitraryGroupView } from "./arbitraryGroup/presentation.js";
import { useToolboxDisclosure } from "./arbitraryGroup/useToolboxDisclosure.js";

export interface ArbitraryGroupCardProps {
  group: ArbitraryGroup;
  /** Stable accordion id; defaults to the feed's `grp-<first-filename>` key. */
  groupId?: string;
  now?: Date;
  participants?: Record<string, Participant>;
  comments?: AnyEventRecord[];
  allEvents?: AnyEventRecord[];
}

export function ArbitraryGroupCard({
  group,
  groupId = `grp-${group.items[0]?.filename ?? group.timeRangeStart}`,
  now = new Date(),
  participants = {},
  comments = [],
  allEvents = [],
}: ArbitraryGroupCardProps): JSX.Element {
  const wantsOpenByDefault =
    group.status === NO_LOOSE_STRING_VALUES.streaming || group.hasFailedSubagent === true;
  const disclosure = useToolboxDisclosure({ groupId, wantsOpenByDefault });
  const [olderRevealed, setOlderRevealed] = useState(false);
  const [targetToolFilename, setTargetToolFilename] = useState<string | null>(null);
  const [targetToolRevision, setTargetToolRevision] = useState(0);

  // Word-reveal must fire only for content arriving LIVE, never on session load.
  // A historical un-concluded turn loads with status "streaming" too, so status
  // alone would scramble the whole feed for ~1.5s on open. Instead reveal only
  // when this group GREW since its last render (a live delta appended in place);
  // a group that mounts with a full batch (load/switch) never reveals.
  const prevItemCountRef = useRef<number | null>(null);
  const isLiveStreaming =
    group.status === NO_LOOSE_STRING_VALUES.streaming &&
    prevItemCountRef.current !== null &&
    group.items.length > prevItemCountRef.current;
  useEffect(() => {
    prevItemCountRef.current = group.items.length;
  }, [group.items.length]);
  useEffect(() => {
    setTargetToolFilename(null);
    setTargetToolRevision(0);
  }, [groupId]);
  const view = buildArbitraryGroupView({
    group,
    now,
    participants,
    allEvents,
    isOpen: disclosure.isOpen,
  });

  const openPreviewItem = (filename: string | null): void => {
    setTargetToolFilename(filename);
    setTargetToolRevision((revision) => revision + 1);
    if (filename !== null) setOlderRevealed(true);
    disclosure.open();
  };

  return (
    <div
      className={`toolbox${disclosure.shown ? " open" : ""}`}
      data-status={group.status}
    >
      <ArbitraryGroupHeader
        group={group}
        view={view}
        isOpen={disclosure.isOpen}
        onToggle={disclosure.toggle}
      />
      {!disclosure.mounted ? (
        <ArbitraryGroupPreview view={view} onOpenItem={openPreviewItem} />
      ) : null}
      {disclosure.mounted ? (
        <ArbitraryGroupBody
          group={group}
          view={view}
          olderRevealed={olderRevealed}
          setOlderRevealed={setOlderRevealed}
          participants={participants}
          comments={comments}
          allEvents={allEvents}
          isLiveStreaming={isLiveStreaming}
          targetToolFilename={targetToolFilename}
          targetToolRevision={targetToolRevision}
        />
      ) : null}
    </div>
  );
}
