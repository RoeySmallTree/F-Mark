import { useState } from "react";
import type { TodoPayload } from "@f-mark/shared";
import { buildTodoCardModel } from "./todoCardModel/buildModel.js";
import { createTodoCardMutationController } from "./todoCardModel/mutationController.js";
import {
  useTodoCardPostContext,
  useTodoCardRuntimeContext,
} from "./todoCardModel/postContext.js";
import type {
  InlineDraft,
  TodoCardModel,
  TodoCardProps,
} from "./types.js";
import { useTodoCardProjection } from "./useTodoCardProjection.js";

const NO_LOOSE_STRING_VALUES = {
  standalone: "standalone",
} as const;

export function useTodoCardModel({
  event,
  participants,
  allEvents,
  variant = NO_LOOSE_STRING_VALUES.standalone,
}: TodoCardProps): TodoCardModel | null {
  const projection = useTodoCardProjection({ event, participants, allEvents });
  const runtimeContext = useTodoCardRuntimeContext(participants);
  const [draft, setDraft] = useState<InlineDraft | null>(null);
  const [latestOverride, setLatestOverride] = useState<string | null>(null);
  const payloadId = (event.payload as TodoPayload).id;
  const postContext = useTodoCardPostContext(
    runtimeContext,
    payloadId,
    setLatestOverride,
  );

  if (projection === null) return null;

  const controller = createTodoCardMutationController({
    event,
    projection,
    actorId: runtimeContext.userId ?? event.participant_id,
    latestOverride,
    postContext,
    setDraft,
  });

  return buildTodoCardModel({
    projection,
    variant,
    timestamp: event.timestamp,
    participants,
    agentIds: runtimeContext.agentIds,
    draft,
    setDraft,
    controller,
  });
}
