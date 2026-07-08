import type { TodoPayload, TodoTreeNode } from "@f-mark/shared";
import type { PostTodoBody } from "../../api/client.js";
import type { TodoItemValues } from "../../cards/TodoItem.js";
import {
  fieldValue,
  pickRandomAgentId,
  titleForPost,
} from "../todoPanelUtils.js";
import type { DraftTodo } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  open: "open",
} as const;

interface MakeCreateTodoBodyArgs {
  actorId: string | null;
  id: string;
  patch: Partial<TodoPayload>;
  parentId?: string;
  draft: DraftTodo | null;
  agentIds: string[];
}

export function makeCreateTodoBody({
  actorId,
  id,
  patch,
  parentId,
  draft,
  agentIds,
}: MakeCreateTodoBodyArgs): PostTodoBody | null {
  if (actorId === null) return null;
  const body: PostTodoBody = {
    participant_id: actorId,
    id,
    title: titleForPost(String(patch.title ?? "")),
    status: patch.status ?? NO_LOOSE_STRING_VALUES.open,
  };
  const assignedTo =
    draft?.id === id ? draft.assignedTo : pickRandomAgentId(agentIds);
  if (assignedTo !== undefined) body.assigned_to = assignedTo;
  if (parentId !== undefined) body.parent_id = parentId;
  if (patch.body !== undefined) body.body = patch.body;
  return body;
}

interface MakeUpdateTodoBodyArgs {
  actorId: string | null;
  node: TodoTreeNode;
  patch: Partial<TodoPayload>;
  assignedTo?: string | null;
  latestById: Map<string, string>;
}

export function makeUpdateTodoBody({
  actorId,
  node,
  patch,
  assignedTo = undefined,
  latestById,
}: MakeUpdateTodoBodyArgs): PostTodoBody | null {
  if (actorId === null) return null;
  const title =
    patch.title !== undefined ? patch.title : fieldValue(node.title);
  const body: PostTodoBody = {
    participant_id: actorId,
    id: node.id,
    title: titleForPost(title),
    status: patch.status ?? node.status,
  };
  if (patch.body !== undefined) {
    body.body = patch.body;
  } else if (node.body !== undefined) {
    body.body = node.body;
  }
  if (assignedTo === undefined) {
    if (node.assigned_to !== undefined) body.assigned_to = node.assigned_to;
  } else if (assignedTo !== null) {
    body.assigned_to = assignedTo;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "parent_id")) {
    if (patch.parent_id !== undefined) body.parent_id = patch.parent_id;
  } else if (node.parent_id !== undefined) {
    body.parent_id = node.parent_id;
  }
  const supersedes = latestById.get(node.id);
  if (supersedes !== undefined) body.supersedes = supersedes;
  return body;
}

export function dirtyValuesPatch(
  node: TodoTreeNode,
  values: TodoItemValues | undefined,
): Partial<TodoPayload> {
  if (values === undefined) return {};
  const patch: Partial<TodoPayload> = {};
  if (values.title !== fieldValue(node.title)) patch.title = values.title;
  if (values.body !== fieldValue(node.body)) patch.body = values.body;
  return patch;
}
