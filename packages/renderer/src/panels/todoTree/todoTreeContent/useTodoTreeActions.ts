import { createDraftTodoActions } from "./draftTodoActions.js";
import { createExistingTodoActions } from "./existingTodoActions.js";
import type { TodoTreeActionDeps, TodoTreeActions } from "./types.js";

export function useTodoTreeActions(
  deps: TodoTreeActionDeps,
): TodoTreeActions {
  return {
    createDraft: deps.createDraft,
    updateExisting: deps.updateExisting,
    ...createDraftTodoActions(deps),
    ...createExistingTodoActions(deps),
  };
}
