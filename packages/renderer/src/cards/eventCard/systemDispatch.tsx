import { type JSX } from "react";
import type {
  ForkLinkEventRecord,
  SubagentOutputEventRecord,
  SubagentRunEventRecord,
  ToolUseEventRecord,
} from "@f-mark/shared";
import { AccessRequestCard } from "../AccessRequestCard.js";
import { ForkLinkCard } from "../ForkLinkCard.js";
import { SubagentCard } from "../SubagentCard.js";
import { ToolUseCard } from "../ToolUseCard.js";
import { TurnEndDivider } from "../TurnEndDivider.js";
import { FlowCardBoundary } from "./FlowCardBoundary.js";
import type { EventCardProps } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  toolUse: "tool-use",
  subagentRun: "subagent-run",
  subagentOutput: "subagent-output",
  accessRequest: "access-request",
  accessResponse: "access-response",
  turnEnd: "turn-end",
  flow: "flow",
  forkLink: "fork-link",
} as const;

export function renderSystemEvent(
  props: EventCardProps,
): JSX.Element | null | undefined {
  if (props.event.kind === NO_LOOSE_STRING_VALUES.toolUse) {
    return (
      <ToolUseCard
        event={props.event as ToolUseEventRecord}
        autoOpen={props.toolAutoOpen}
        autoOpenRevision={props.toolAutoOpenRevision}
      />
    );
  }
  if (props.event.kind === NO_LOOSE_STRING_VALUES.subagentRun || props.event.kind === NO_LOOSE_STRING_VALUES.subagentOutput) {
    return (
      <SubagentCard
        event={props.event as SubagentRunEventRecord | SubagentOutputEventRecord}
      />
    );
  }
  if (props.event.kind === NO_LOOSE_STRING_VALUES.accessRequest) {
    return (
      <AccessRequestCard
        event={props.event}
        participants={props.participants}
        allEvents={props.allEvents}
      />
    );
  }
  if (props.event.kind === NO_LOOSE_STRING_VALUES.accessResponse) return null;
  if (props.event.kind === NO_LOOSE_STRING_VALUES.turnEnd) {
    return (
      <TurnEndDivider
        event={props.event}
        participants={props.participants}
        allEvents={props.allEvents}
      />
    );
  }
  if (props.event.kind === NO_LOOSE_STRING_VALUES.flow) {
    return <FlowCardBoundary event={props.event} participants={props.participants} />;
  }
  if (props.event.kind === NO_LOOSE_STRING_VALUES.forkLink) {
    return <ForkLinkCard event={props.event as ForkLinkEventRecord} />;
  }
  return undefined;
}
