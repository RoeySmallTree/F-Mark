import {
  generateTodoId,
  pickRandomAgentId,
} from "../../todoPanelUtils.js";
import {
  previousFocusIdForDraft,
  previousSameDepthIdForDraft,
} from "../draftNavigation.js";
import type { DraftTodo } from "../types.js";
import type {
  TodoTreeActionDeps,
  TodoTreeActions,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  title: "title",
} as const;

type DraftTodoActions = Pick<
  TodoTreeActions,
  | "clearDraft"
  | "commitDraftAndCreateBelow"
  | "createChildDraftFromDraft"
  | "focusPreviousDraft"
  | "indentDraft"
  | "outdentDraft"
  | "updateDraftAssignee"
>;

export function createDraftTodoActions({
  agentIds,
  createDraft,
  flat,
  flatById,
  focusTodo,
  setDraft,
}: TodoTreeActionDeps): DraftTodoActions {
  function indentDraft(currentDraft: DraftTodo, depth: number): void {
    const parentId = previousSameDepthIdForDraft(
      currentDraft,
      depth,
      flat,
      flatById,
    );
    if (parentId === null) return;
    setDraft((current) =>
      current?.id === currentDraft.id
        ? { ...current, parentId, afterId: undefined }
        : current,
    );
  }

  function outdentDraft(currentDraft: DraftTodo): void {
    if (currentDraft.parentId === undefined) return;
    const parent = flatById.get(currentDraft.parentId);
    setDraft((current) =>
      current?.id === currentDraft.id
        ? {
            ...current,
            parentId: parent?.parentId,
            afterId: currentDraft.parentId,
          }
        : current,
    );
  }

  async function commitDraftAndCreateBelow(
    currentDraft: DraftTodo,
    patch: { title: string; body: string },
  ): Promise<void> {
    const created = await createDraft(currentDraft, patch);
    if (!created) return;
    setDraft({
      id: generateTodoId(),
      parentId: currentDraft.parentId,
      afterId: currentDraft.id,
      assignedTo: pickRandomAgentId(agentIds),
    });
  }

  async function createChildDraftFromDraft(
    currentDraft: DraftTodo,
    values: { title: string; body: string },
  ): Promise<void> {
    const created = await createDraft(currentDraft, values);
    if (!created) return;
    setDraft({
      id: generateTodoId(),
      parentId: currentDraft.id,
      assignedTo: pickRandomAgentId(agentIds),
    });
  }

  function updateDraftAssignee(
    currentDraft: DraftTodo,
    participantId: string | null,
  ): void {
    setDraft((current) =>
      current?.id === currentDraft.id
        ? {
            ...current,
            assignedTo: participantId ?? undefined,
          }
        : current,
    );
  }

  function focusPreviousDraft(currentDraft: DraftTodo): void {
    const targetId = previousFocusIdForDraft(currentDraft, flat);
    if (targetId !== null) focusTodo(targetId, NO_LOOSE_STRING_VALUES.title);
  }

  return {
    clearDraft: () => {
      setDraft(null);
    },
    commitDraftAndCreateBelow,
    createChildDraftFromDraft,
    focusPreviousDraft,
    indentDraft,
    outdentDraft,
    updateDraftAssignee,
  };
}
