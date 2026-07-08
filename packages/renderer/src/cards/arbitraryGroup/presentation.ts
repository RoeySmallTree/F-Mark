import type { AnyEventRecord, Participant } from "@f-mark/shared";
import {
  GROUP_STATUSES,
  type ArbitraryGroup,
} from "../../feed/projectFeed.js";
import { formatElapsed } from "../../lib/elapsed.js";
import {
  approvalAdjustedElapsedMs,
  eventTimestampMs,
} from "../../lib/approvalPauseClock.js";
import { whoOf } from "../format.js";
import {
  isThinkingProse,
  lastToolUseFilename,
  projectedItems,
} from "./projectItems.js";
import type { RenderItem } from "./types.js";

const TOOLBOX_VISIBLE_ITEM_LIMIT = 5;
export const TOOLBOX_COLLAPSE_MS = 260;

const groupPresentationCopy = {
  working: "working",
  empty: "",
  tool: "tool",
  tools: "tools",
  approval: "approval",
  approvals: "approvals",
  subAgent: "sub-agent",
  subAgents: "sub-agents",
  noLiveTool: "none",
} as const;

function groupElapsedLabel(
  group: ArbitraryGroup,
  now: Date,
  allEvents: readonly AnyEventRecord[],
): string | null {
  const startMs = eventTimestampMs(group.timeRangeStart);
  if (startMs === null) return null;
  const endMs =
    group.status === GROUP_STATUSES.streaming
      ? now.getTime()
      : eventTimestampMs(group.timeRangeEnd);
  if (endMs === null) return null;
  const elapsedMs = approvalAdjustedElapsedMs(allEvents, {
    requestEvents: group.items,
    participantIds: [group.participant_id],
    startMs,
    endMs,
  });
  return formatElapsed(elapsedMs);
}

export interface ArbitraryGroupView {
  participantId: string;
  participant?: Participant;
  participantName: string;
  participantTitle?: string;
  timingLabel: string;
  toolLabel: string;
  accessLabel: string;
  subagentLabel: string;
  countLabels: string[];
  isThinkingOnly: boolean;
  renderItems: RenderItem[];
  liveToolFilename: string | null;
  toolAutoOpenRevision: string;
}

export function buildArbitraryGroupView(input: {
  group: ArbitraryGroup;
  now: Date;
  participants: Record<string, Participant>;
  allEvents: readonly AnyEventRecord[];
  isOpen: boolean;
}): ArbitraryGroupView {
  const { group, now, participants, allEvents, isOpen } = input;
  const who = whoOf(group.participant_id, participants);
  const participantName = who.name.trim() || group.participant_id;
  const elapsed = groupElapsedLabel(group, now, allEvents);
  const timingLabel =
    elapsed ??
    (group.status === GROUP_STATUSES.streaming
      ? groupPresentationCopy.working
      : groupPresentationCopy.empty);
  const toolLabel = countLabel(
    group.toolCount,
    groupPresentationCopy.tool,
    groupPresentationCopy.tools,
  );
  const accessLabel = countLabel(
    group.accessRequestCount ?? 0,
    groupPresentationCopy.approval,
    groupPresentationCopy.approvals,
  );
  const subagentLabel = countLabel(
    group.subagentCount ?? 0,
    groupPresentationCopy.subAgent,
    groupPresentationCopy.subAgents,
  );
  const renderItems = projectedItems(group.items);
  const liveToolFilename =
    isOpen && group.status === GROUP_STATUSES.streaming
      ? lastToolUseFilename(renderItems)
      : null;
  return {
    participantId: group.participant_id,
    participant: participants[group.participant_id],
    participantName,
    participantTitle:
      participantName === group.participant_id ? undefined : group.participant_id,
    timingLabel,
    toolLabel,
    accessLabel,
    subagentLabel,
    countLabels: [toolLabel, accessLabel, subagentLabel].filter(
      (label): label is string => label.length > 0,
    ),
    isThinkingOnly:
      group.items.length > 0 && group.items.every(isThinkingProse),
    renderItems,
    liveToolFilename,
    toolAutoOpenRevision: [
      group.status,
      group.timeRangeEnd,
      group.items.length,
      liveToolFilename ?? groupPresentationCopy.noLiveTool,
    ].join(":"),
  };
}

export function visibleGroupItems(input: {
  renderItems: RenderItem[];
  olderRevealed: boolean;
}): { hiddenItemCount: number; visibleItems: RenderItem[] } {
  const { renderItems, olderRevealed } = input;
  const hiddenItemCount =
    !olderRevealed && renderItems.length > TOOLBOX_VISIBLE_ITEM_LIMIT
      ? renderItems.length - TOOLBOX_VISIBLE_ITEM_LIMIT
      : 0;
  return {
    hiddenItemCount,
    visibleItems:
      hiddenItemCount > 0
        ? renderItems.slice(-TOOLBOX_VISIBLE_ITEM_LIMIT)
        : renderItems,
  };
}

function countLabel(count: number, singular: string, plural: string): string {
  if (count === 0) return "";
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}
