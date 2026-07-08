import type { FormEvent, KeyboardEvent } from "react";
import type { RootScope } from "../../api/client.js";
import { canCreateTodo } from "./model.js";
import { submitCreateTodo } from "./submitTodo.js";
import type {
  CreateTodoActions,
  CreateTodoAssigneeState,
  CreateTodoFields,
} from "./types.js";

export interface CreateTodoActionsInput {
  token: string | null;
  sessionId: string | null;
  userId: string | null;
  scope: RootScope | null;
  fields: CreateTodoFields;
  assignee: CreateTodoAssigneeState;
  submitError: string | null;
  setSubmitError(value: string | null): void;
  busy: boolean;
  setBusy(value: boolean): void;
  onClose(): void;
  onCreated(): Promise<void>;
}

export function createTodoActions(
  input: CreateTodoActionsInput,
): CreateTodoActions {
  async function submitTodo(): Promise<void> {
    await submitCreateTodo({
      token: input.token,
      sessionId: input.sessionId,
      userId: input.userId,
      scope: input.scope,
      title: input.fields.title,
      description: input.fields.description,
      parentId: input.fields.parentId,
      assignedTo: input.assignee.assignedTo,
      assignedToCurrentSessionAgent:
        input.assignee.assignedToCurrentSessionAgent,
      sessionAgentIds: input.assignee.sessionAgentIds,
      titleRef: input.fields.titleRef,
      setBusy: input.setBusy,
      setSubmitError: input.setSubmitError,
      onClose: input.onClose,
      onCreated: input.onCreated,
    });
  }

  return {
    submitError: input.submitError,
    busy: input.busy,
    canCreate: canCreateTodo({
      title: input.fields.title,
      busy: input.busy,
      sessionId: input.sessionId,
      userId: input.userId,
    }),
    onSubmit(e: FormEvent<HTMLFormElement>): void {
      e.preventDefault();
      void submitTodo();
    },
    onTitleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
      if (e.key !== "Enter") return;
      e.preventDefault();
      input.fields.descriptionRef.current?.focus();
    },
    onDescriptionKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
      if (e.key !== "Enter") return;
      e.preventDefault();
      void submitTodo();
    },
  };
}
