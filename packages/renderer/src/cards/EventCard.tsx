/* EventCard — dispatcher that picks the right card component for an event.

   Routing rules:
     prose with no name + no target → MessageCard
     prose with name                → ProseCard
     prose with target              → null (rendered as pin inside ProseCard /
                                            as bubble inside RightComments)
     choices                        → ChoicesCard
     choice                         → ChoiceCard (answer summary; reached only via the
                                       conversation feed — the main feed filters
                                       choices out by kind, and ChoicesCard also
                                       reflects the selection as state)
     html                           → EmbedCard
     todo                           → TodoCard
     file                           → FileCard
     tool-use                       → ToolUseCard
     subagent-run/output            → SubagentCard
     access-request                 → AccessRequestCard
     access-response                → null (consumed by AccessRequestCard)
     turn-end                       → TurnEndDivider
     flow                           → FlowCard
*/

import { type JSX } from "react";
import { renderEventCard } from "./eventCard/eventDispatch.js";
import type { EventCardProps } from "./eventCard/types.js";

export type { EventCardProps } from "./eventCard/types.js";

export function EventCard({
  event,
  participants,
  comments,
  allEvents,
  consumedFilenames,
  blocks,
  commentsByFilename,
  toolAutoOpen,
  toolAutoOpenRevision,
}: EventCardProps): JSX.Element | null {
  return renderEventCard({
    event,
    participants,
    comments,
    allEvents,
    consumedFilenames,
    blocks,
    commentsByFilename,
    toolAutoOpen,
    toolAutoOpenRevision,
  });
}
