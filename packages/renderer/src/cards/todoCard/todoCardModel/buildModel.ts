import type { Dispatch, SetStateAction } from "react";
import type { Participant } from "@f-mark/shared";
import {
  buildTodoCardContainerModel,
  buildTodoCardHeaderModel,
  buildTodoCardItemModel,
  buildTodoDraftItemModel,
} from "../todoCardModels.js";
import type {
  InlineDraft,
  TodoCardModel,
  TodoCardProps,
} from "../types.js";
import type { TodoCardProjection } from "../useTodoCardProjection.js";
import type { TodoCardMutationController } from "./mutationController.js";

interface BuildTodoCardModelInput {
  projection: TodoCardProjection;
  variant: NonNullable<TodoCardProps["variant"]>;
  timestamp: string;
  participants: Record<string, Participant>;
  agentIds: string[];
  draft: InlineDraft | null;
  setDraft: Dispatch<SetStateAction<InlineDraft | null>>;
  controller: TodoCardMutationController;
}

export function buildTodoCardModel({
  projection,
  variant,
  timestamp,
  participants,
  agentIds,
  draft,
  setDraft,
  controller,
}: BuildTodoCardModelInput): TodoCardModel {
  const { payload, node, depth, flat, flatById } = projection;

  return {
    container: buildTodoCardContainerModel(
      payload.id,
      projection.done,
      projection.removed,
    ),
    header: buildTodoCardHeaderModel(
      variant,
      projection.who,
      timestamp,
      projection.done,
      projection.wip,
      projection.removed,
    ),
    item: buildTodoCardItemModel({
      node,
      depth,
      participants,
      agentIds,
      payloadId: payload.id,
      done: projection.done,
      wip: projection.wip,
      flat,
      flatById,
      setDraft,
      updateTodo: controller.updateTodo,
      saveDirtyThen: controller.saveDirtyThen,
      reparent: controller.reparent,
      fetchDescendants: controller.fetchDescendants,
    }),
    draft:
      draft === null
        ? null
        : buildTodoDraftItemModel({
            draft,
            node,
            depth,
            participants,
            agentIds,
            payloadId: payload.id,
            setDraft,
            createDraft: controller.createDraft,
          }),
  };
}
