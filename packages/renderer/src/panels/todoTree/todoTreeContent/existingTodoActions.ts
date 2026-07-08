import type { TodoPayload, TodoTreeNode } from "@f-mark/shared";
import type {
  TodoInputField,
  TodoItemValues,
} from "../../../cards/TodoItem.js";
import {
  generateTodoId,
  nextIndentParentId,
  nextOutdentParentId,
  pickRandomAgentId,
} from "../../todoPanelUtils.js";
import { dirtyValuesPatch } from "../todoBodies.js";
import type {
  TodoTreeActionDeps,
  TodoTreeActions,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  todo: "todo",
  root: "ROOT",
  title: "title",
  addRow: "add-row",
  removed: "removed",
} as const;

type ExistingTodoActions = Pick<
  TodoTreeActions,
  | "commitExistingAndCreateBelow"
  | "focusNextTodo"
  | "focusPreviousTodo"
  | "indentTodo"
  | "outdentTodo"
  | "removeTodo"
  | "startChildDraft"
>;

export function createExistingTodoActions({
  agentIds,
  flat,
  flatById,
  focusTodo,
  pendingFocusRef,
  setDraft,
  updateExisting,
}: TodoTreeActionDeps): ExistingTodoActions {
  function startChildDraft(parentId: string): void {
    setDraft({
      id: generateTodoId(),
      parentId,
      assignedTo: pickRandomAgentId(agentIds),
    });
  }

  async function reparentTodo(
    node: TodoTreeNode,
    parentId: string | null,
    field: TodoInputField,
    values: TodoItemValues,
  ): Promise<void> {
    if ((node.parent_id ?? null) === parentId) return;
    pendingFocusRef.current = { kind: NO_LOOSE_STRING_VALUES.todo, id: node.id, field };
    const patch: Partial<TodoPayload> = {
      title: values.title,
      body: values.body,
      parent_id: parentId ?? undefined,
    };
    const updated = await updateExisting(node, patch);
    if (!updated) pendingFocusRef.current = null;
  }

  async function indentTodo(
    node: TodoTreeNode,
    field: TodoInputField,
    values: TodoItemValues,
  ): Promise<void> {
    const parentId = nextIndentParentId(flat, node.id);
    if (parentId === null) return;
    await reparentTodo(node, parentId, field, values);
  }

  async function outdentTodo(
    node: TodoTreeNode,
    field: TodoInputField,
    values: TodoItemValues,
  ): Promise<void> {
    const parentId = nextOutdentParentId(flat, node.id);
    if (parentId === null) return;
    await reparentTodo(
      node,
      parentId === NO_LOOSE_STRING_VALUES.root ? null : parentId,
      field,
      values,
    );
  }

  function focusPreviousTodo(id: string): void {
    const item = flatById.get(id);
    const targetId = item?.prevSameDepthId ?? item?.prevId ?? null;
    if (targetId !== null) focusTodo(targetId, NO_LOOSE_STRING_VALUES.title);
  }

  function focusNextTodo(id: string): void {
    const item = flatById.get(id);
    const targetId = item?.nextSameDepthId ?? item?.nextId ?? null;
    if (targetId !== null) focusTodo(targetId, NO_LOOSE_STRING_VALUES.title);
  }

  async function removeTodo(
    node: TodoTreeNode,
    field?: TodoInputField,
    values?: TodoItemValues,
  ): Promise<void> {
    const item = flatById.get(node.id);
    const targetId = item?.prevId ?? item?.nextId ?? null;
    if (targetId === null) {
      pendingFocusRef.current = { kind: NO_LOOSE_STRING_VALUES.addRow };
    } else {
      pendingFocusRef.current = {
        kind: NO_LOOSE_STRING_VALUES.todo,
        id: targetId,
        field: field ?? NO_LOOSE_STRING_VALUES.title,
      };
    }
    const removed = await updateExisting(node, {
      ...dirtyValuesPatch(node, values),
      status: NO_LOOSE_STRING_VALUES.removed,
    });
    if (!removed) pendingFocusRef.current = null;
  }

  async function commitExistingAndCreateBelow(
    node: TodoTreeNode,
    patch: TodoItemValues,
  ): Promise<void> {
    const updated = await updateExisting(node, patch);
    if (!updated) return;
    setDraft({
      id: generateTodoId(),
      parentId: node.parent_id,
      afterId: node.id,
      assignedTo: pickRandomAgentId(agentIds),
    });
  }

  return {
    commitExistingAndCreateBelow,
    focusNextTodo,
    focusPreviousTodo,
    indentTodo,
    outdentTodo,
    removeTodo,
    startChildDraft,
  };
}
