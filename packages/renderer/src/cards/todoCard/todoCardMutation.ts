import type { Dispatch, SetStateAction } from "react";
import type { TodoPayload, TodoTreeNode } from "@f-mark/shared";
import { createClient, type PostTodoBody } from "../../api/client.js";
import { createManagedAgentsClient } from "../../api/managedAgents.js";
import { rootScopeForSession, scopeToBody } from "../../api/rootScope.js";
import { titleForPost } from "../../panels/todoPanelUtils.js";
import {
  dirtyValuesPatch as dirtyTodoValuesPatch,
  makeUpdateTodoBody,
} from "../../panels/todoTree/todoBodies.js";
import type { TodoItemNode, TodoItemValues } from "../TodoItem.js";
import type { InlineDraft } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  todo: "todo",
  open: "open",
} as const;

interface TodoCardSession {
  id: string;
  path?: string;
  path_id?: string;
}

export interface TodoCardPostContext {
  sessionId: string | null;
  token: string | null;
  sessions: TodoCardSession[];
  activePathId: string | null;
  activePath: string | null;
  agentIds: string[];
  trackedTodoId: string;
  setLatestOverride: Dispatch<SetStateAction<string | null>>;
}

interface MakeTodoCardUpdateBodyInput {
  actorId: string;
  node: TodoItemNode;
  patch: Partial<TodoPayload>;
  assignedTo?: string | null;
  latestById: Map<string, string>;
  latestOverride: string | null;
  fallbackSupersedes: string;
}

interface CreateDraftTodoInput {
  actorId: string;
  currentDraft: InlineDraft;
  values: TodoItemValues;
  status?: TodoPayload["status"];
  postTodo: (body: PostTodoBody) => Promise<void>;
  clearDraft: () => void;
}

export async function postTodoForCard(
  context: TodoCardPostContext,
  body: PostTodoBody,
): Promise<void> {
  const { sessionId } = context;
  if (sessionId === null) return;
  const scope = rootScopeForSession(
    context.sessions.find((s) => s.id === sessionId),
    context.activePathId,
    context.activePath,
  );
  if (scope === null) return;
  const client = createClient({ baseUrl: "", token: context.token });
  const managedClient = createManagedAgentsClient({
    baseUrl: "",
    token: context.token,
  });
  const result = await client.postTodo(sessionId, body, scope);
  if (
    body.assigned_to !== undefined &&
    context.agentIds.includes(body.assigned_to)
  ) {
    await managedClient.wakeSession(sessionId, {
      reason: NO_LOOSE_STRING_VALUES.todo,
      source_event: result.filename,
      target_participant_ids: [body.assigned_to],
      ...scopeToBody(scope),
    });
  }
  if (body.id === context.trackedTodoId) {
    context.setLatestOverride(result.filename);
  }
}

export function makeTodoCardUpdateBody({
  actorId,
  node,
  patch,
  assignedTo,
  latestById,
  latestOverride,
  fallbackSupersedes,
}: MakeTodoCardUpdateBodyInput): PostTodoBody | null {
  return makeUpdateTodoBody({
    actorId,
    node: node as TodoTreeNode,
    patch,
    assignedTo,
    latestById: latestForUpdate(
      node.id,
      latestById,
      latestOverride,
      fallbackSupersedes,
    ),
  });
}

export function dirtyTodoCardValuesPatch(
  node: TodoItemNode,
  values: TodoItemValues | undefined,
): Partial<TodoPayload> {
  return dirtyTodoValuesPatch(node as TodoTreeNode, values);
}

export async function createDraftTodo({
  actorId,
  currentDraft,
  values,
  status = NO_LOOSE_STRING_VALUES.open,
  postTodo,
  clearDraft,
}: CreateDraftTodoInput): Promise<boolean> {
  if (values.title.trim().length === 0 && values.body.length === 0) {
    return false;
  }
  const body: PostTodoBody = {
    participant_id: actorId,
    id: currentDraft.id,
    title: titleForPost(values.title),
    status,
  };
  if (values.body.length > 0) body.body = values.body;
  if (currentDraft.parentId !== undefined) {
    body.parent_id = currentDraft.parentId;
  }
  if (currentDraft.assignedTo !== undefined) {
    body.assigned_to = currentDraft.assignedTo;
  }
  await postTodo(body);
  clearDraft();
  return true;
}

function latestForUpdate(
  id: string,
  latestById: Map<string, string>,
  latestOverride: string | null,
  fallbackSupersedes: string,
): Map<string, string> {
  const latest = new Map(latestById);
  latest.set(id, latestOverride ?? latestById.get(id) ?? fallbackSupersedes);
  return latest;
}
