/* EventCard — dispatcher that picks the right card component for an event.

   Routing rules (Phase 5 — Cards):
     prose with no name + no target → MessageCard
     prose with name                → ProseCard
     prose with target              → null (rendered as pin inside ProseCard /
                                            as bubble inside RightComments)
     choices                        → ChoicesCard
     choice                         → null (consumed as state inside ChoicesCard)
     html                           → EmbedCard
     todo                           → TodoCard
     file                           → FileCard
     tool-use                       → ToolUseCard
     turn-end                       → TurnEndDivider
     flow                           → FlowCard
*/

import { type JSX } from "react";
import type {
  AnyEventRecord,
  Participant,
  ProsePayload,
  ToolUseEventRecord,
} from "@f-mark/shared";
import { getProseRole } from "@f-mark/shared";
import { MessageCard } from "./MessageCard.js";
import { ProseCard } from "./ProseCard.js";
import { ChoicesCard } from "./ChoicesCard.js";
import { EmbedCard } from "./EmbedCard.js";
import { TodoCard } from "./TodoCard.js";
import { FileCard } from "./FileCard.js";
import { ToolUseCard } from "./ToolUseCard.js";
import { TurnEndDivider } from "./TurnEndDivider.js";
import { FlowCard } from "./FlowCard.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  comments: AnyEventRecord[];
  allEvents: AnyEventRecord[];
}

export function EventCard({
  event,
  participants,
  comments,
  allEvents,
}: Props): JSX.Element | null {
  if (event.kind === "prose") {
    const role = getProseRole(event.payload as ProsePayload);
    /* Comments are rendered inside the target card / right panel, not as
       top-level cards. */
    if (role.kind === "comment") return null;
    if (role.kind === "anchor") {
      return (
        <ProseCard
          event={event}
          participants={participants}
          comments={comments}
        />
      );
    }
    return <MessageCard event={event} participants={participants} />;
  }
  if (event.kind === "choices") {
    return (
      <ChoicesCard
        event={event}
        participants={participants}
        allEvents={allEvents}
      />
    );
  }
  if (event.kind === "choice") return null;
  if (event.kind === "html") {
    return (
      <EmbedCard
        event={event}
        participants={participants}
        allEvents={allEvents}
      />
    );
  }
  if (event.kind === "todo") {
    return (
      <TodoCard
        event={event}
        participants={participants}
        allEvents={allEvents}
      />
    );
  }
  if (event.kind === "file") {
    return <FileCard event={event} participants={participants} />;
  }
  if (event.kind === "tool-use") {
    return <ToolUseCard event={event as ToolUseEventRecord} />;
  }
  if (event.kind === "turn-end") {
    return <TurnEndDivider event={event} participants={participants} />;
  }
  if (event.kind === "flow") {
    return <FlowCard event={event} participants={participants} />;
  }
  return null;
}
