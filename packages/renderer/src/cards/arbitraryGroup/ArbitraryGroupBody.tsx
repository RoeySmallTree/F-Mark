import type { AnyEventRecord, Participant } from "@f-mark/shared";
import type { ArbitraryGroup } from "../../feed/projectFeed.js";
import { EventCard } from "../EventCard.js";
import { MessageCard } from "../MessageCard.js";
import { SubagentBox } from "../SubagentBox.js";
import type { ArbitraryGroupView } from "./presentation.js";
import { visibleGroupItems } from "./presentation.js";

const NO_LOOSE_STRING_VALUES = {
  tool: "tool",
  tools: "tools",
  subagent: "subagent",
  proseRun: "prose-run",
  streaming: "streaming",
  toolUse: "tool-use",
  none: "none",
  narration: "narration",
} as const;

interface ArbitraryGroupBodyProps {
  group: ArbitraryGroup;
  view: ArbitraryGroupView;
  olderRevealed: boolean;
  setOlderRevealed(next: boolean): void;
  participants: Record<string, Participant>;
  comments: AnyEventRecord[];
  allEvents: AnyEventRecord[];
  /** True only while this group is actively receiving live deltas — drives the
     word-reveal so it never fires on historical session load. */
  isLiveStreaming: boolean;
  targetToolFilename: string | null;
  targetToolRevision: number;
}

export function ArbitraryGroupBody({
  group,
  view,
  olderRevealed,
  setOlderRevealed,
  participants,
  comments,
  allEvents,
  isLiveStreaming,
  targetToolFilename,
  targetToolRevision,
}: ArbitraryGroupBodyProps): JSX.Element {
  const { hiddenItemCount, visibleItems } = visibleGroupItems({
    renderItems: view.renderItems,
    olderRevealed,
  });
  return (
    <div className="toolbox-collapse">
      <div className="toolbox-clip">
        <div className="toolbox-body">
          {hiddenItemCount > 0 ? (
            <button
              type="button"
              className="toolbox-more"
              aria-label={`Show ${hiddenItemCount} older tools`}
              onClick={() => setOlderRevealed(true)}
            >
              {hiddenItemCount} more {hiddenItemCount === 1 ? NO_LOOSE_STRING_VALUES.tool : NO_LOOSE_STRING_VALUES.tools}
            </button>
          ) : null}
          {visibleItems.map((item) =>
            item.type === NO_LOOSE_STRING_VALUES.subagent ? (
              <SubagentBox
                key={`subagent-${item.key}`}
                events={item.events}
                parentStatus={group.status}
              />
            ) : item.type === NO_LOOSE_STRING_VALUES.proseRun ? (
              <MessageCard
                key={`prose-run-${item.key}`}
                event={item.events[0]!}
                content={item.content}
                participants={participants}
                comments={comments}
                revealWords={isLiveStreaming}
                variant={NO_LOOSE_STRING_VALUES.narration}
              />
            ) : (
              <EventCard
                key={item.event.filename}
                event={item.event}
                participants={participants}
                comments={comments}
                allEvents={allEvents}
                toolAutoOpen={toolAutoOpenFor(group, view, item.event, targetToolFilename)}
                toolAutoOpenRevision={`${view.toolAutoOpenRevision}:${targetToolFilename ?? NO_LOOSE_STRING_VALUES.none}:${targetToolRevision}`}
                revealWords={group.status === NO_LOOSE_STRING_VALUES.streaming}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function toolAutoOpenFor(
  group: ArbitraryGroup,
  view: ArbitraryGroupView,
  event: AnyEventRecord,
  targetToolFilename: string | null,
): boolean | undefined {
  if (event.kind !== NO_LOOSE_STRING_VALUES.toolUse) return undefined;
  if (targetToolFilename !== null) return event.filename === targetToolFilename;
  if (group.status !== NO_LOOSE_STRING_VALUES.streaming) return false;
  if (view.liveToolFilename === null) return undefined;
  return event.filename === view.liveToolFilename;
}
