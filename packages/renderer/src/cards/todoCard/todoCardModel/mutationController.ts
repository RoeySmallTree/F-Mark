import type { Dispatch, SetStateAction } from "react";
import type { AnyEventRecord, TodoPayload } from "@f-mark/shared";
import type { PostTodoBody } from "../../../api/client.js";
import type { TodoItemValues } from "../../TodoItem.js";
import {
  createDraftTodo,
  dirtyTodoCardValuesPatch,
  fetchTodoDescendantsForCard,
  makeTodoCardUpdateBody,
  postTodoForCard,
  type TodoCardPostContext,
} from "../todoCardMutation.js";
import { focusInlineTodo } from "../todoNodes.js";
import type { InlineDraft } from "../types.js";
import type { TodoCardProjection } from "../useTodoCardProjection.js";

const NO_LOOSE_STRING_VALUES = {
  open: "open",
} as const;

export interface TodoCardMutationController {
  updateTodo: (
    patch: Partial<TodoPayload>,
    assignedTo?: string | null,
  ) => Promise<void>;
  createDraft: (
    currentDraft: InlineDraft,
    values: TodoItemValues,
    status?: TodoPayload["status"],
  ) => Promise<boolean>;
  saveDirtyThen: (
    values: TodoItemValues,
    next: () => void,
  ) => Promise<void>;
  reparent: (values: TodoItemValues, parentId: string | null) => Promise<void>;
  fetchDescendants: (todoId: string) => Promise<string[]>;
}

interface TodoCardMutationControllerInput {
  event: AnyEventRecord;
  projection: TodoCardProjection;
  actorId: string;
  latestOverride: string | null;
  postContext: TodoCardPostContext;
  setDraft: Dispatch<SetStateAction<InlineDraft | null>>;
}

export function createTodoCardMutationController({
  event,
  projection,
  actorId,
  latestOverride,
  postContext,
  setDraft,
}: TodoCardMutationControllerInput): TodoCardMutationController {
  const { payload, node, latestById } = projection;

  async function postTodo(body: PostTodoBody): Promise<void> {
    await postTodoForCard(postContext, body);
  }

  async function updateTodo(
    patch: Partial<TodoPayload>,
    assignedTo?: string | null,
  ): Promise<void> {
    const body = makeTodoCardUpdateBody({
      actorId,
      node,
      patch,
      assignedTo,
      latestById,
      latestOverride,
      fallbackSupersedes: event.filename,
    });
    if (body === null) return;
    await postTodo(body);
  }

  async function createDraft(
    currentDraft: InlineDraft,
    values: TodoItemValues,
    status: TodoPayload["status"] = NO_LOOSE_STRING_VALUES.open,
  ): Promise<boolean> {
    return createDraftTodo({
      actorId,
      currentDraft,
      values,
      status,
      postTodo,
      clearDraft: () => setDraft(null),
    });
  }

  async function saveDirtyThen(
    values: TodoItemValues,
    next: () => void,
  ): Promise<void> {
    const patch = dirtyTodoCardValuesPatch(node, values);
    if (Object.keys(patch).length > 0) {
      await updateTodo(patch);
    }
    next();
  }

  async function reparent(
    values: TodoItemValues,
    parentId: string | null,
  ): Promise<void> {
    if ((node.parent_id ?? null) === parentId) return;
    await updateTodo({
      title: values.title,
      body: values.body,
      parent_id: parentId ?? undefined,
    });
    focusInlineTodo(payload.id);
  }

  function fetchDescendants(todoId: string): Promise<string[]> {
    return fetchTodoDescendantsForCard(postContext, todoId);
  }

  return {
    updateTodo,
    createDraft,
    saveDirtyThen,
    reparent,
    fetchDescendants,
  };
}
