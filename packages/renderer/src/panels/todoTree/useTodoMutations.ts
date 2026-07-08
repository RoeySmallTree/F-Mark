import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { TodoPayload, TodoTreeNode } from "@f-mark/shared";
import type { PostTodoBody } from "../../api/client.js";
import { titleForPost } from "../todoPanelUtils.js";
import {
  makeCreateTodoBody,
  makeUpdateTodoBody,
} from "./todoBodies.js";
import type { DraftTodo } from "./types.js";

interface UseTodoMutationsArgs {
  actorId: string | null;
  agentIds: string[];
  draft: DraftTodo | null;
  latestById: Map<string, string>;
  postTodo: (body: PostTodoBody) => Promise<void>;
  setActionError: Dispatch<SetStateAction<string | null>>;
  setDraft: Dispatch<SetStateAction<DraftTodo | null>>;
}

interface TodoMutationController {
  updateExisting: (
    node: TodoTreeNode,
    patch: Partial<TodoPayload>,
    assignedTo?: string | null,
  ) => Promise<boolean>;
  createDraft: (
    currentDraft: DraftTodo,
    patch: Partial<TodoPayload>,
  ) => Promise<boolean>;
}

export function useTodoMutations({
  actorId,
  agentIds,
  draft,
  latestById,
  postTodo,
  setActionError,
  setDraft,
}: UseTodoMutationsArgs): TodoMutationController {
  const updateExisting = useCallback(
    async (
      node: TodoTreeNode,
      patch: Partial<TodoPayload>,
      assignedTo?: string | null,
    ): Promise<boolean> => {
      const body = makeUpdateTodoBody({
        actorId,
        node,
        patch,
        assignedTo,
        latestById,
      });
      if (body === null) {
        setActionError("No active session or user.");
        return false;
      }
      if (titleForPost(body.title).trim().length === 0) {
        return false;
      }
      try {
        await postTodo(body);
        setActionError(null);
        return true;
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [actorId, latestById, postTodo, setActionError],
  );

  const createDraft = useCallback(
    async (
      currentDraft: DraftTodo,
      patch: Partial<TodoPayload>,
    ): Promise<boolean> => {
      const titleCandidate = String(patch.title ?? "").trim();
      if (titleCandidate.length === 0) {
        return false;
      }
      const body = makeCreateTodoBody({
        actorId,
        id: currentDraft.id,
        patch,
        parentId: currentDraft.parentId,
        draft,
        agentIds,
      });
      if (body === null) {
        setActionError("No active session or user.");
        return false;
      }
      try {
        await postTodo(body);
        setDraft(null);
        setActionError(null);
        return true;
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [actorId, agentIds, draft, postTodo, setActionError, setDraft],
  );

  return { updateExisting, createDraft };
}
