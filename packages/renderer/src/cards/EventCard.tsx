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
     turn-end                       → TurnEndDivider
*/

import { type JSX } from "react";
import type { AnyEventRecord, Participant, ProsePayload } from "@f-mark/shared";
import { MessageCard } from "./MessageCard.js";
import { ProseCard } from "./ProseCard.js";
import { ChoicesCard } from "./ChoicesCard.js";
import { EmbedCard } from "./EmbedCard.js";
import { TodoCard } from "./TodoCard.js";
import { FileCard } from "./FileCard.js";
import { TurnEndDivider } from "./TurnEndDivider.js";

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
    const payload = event.payload as ProsePayload;
    if (payload.target !== undefined) return null;
    if (payload.name !== undefined && payload.name.length > 0) {
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
    return <TodoCard event={event} participants={participants} />;
  }
  if (event.kind === "file") {
    return <FileCard event={event} participants={participants} />;
  }
  if (event.kind === "turn-end") {
    return <TurnEndDivider event={event} participants={participants} />;
  }
  return null;
}
