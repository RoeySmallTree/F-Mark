import type { RefObject } from "react";
import type { PostTodoBody } from "../../api/client.js";
import { createClient } from "../../api/client.js";
import { createManagedAgentsClient } from "../../api/managedAgents.js";
import { scopeToBody, type RootScope } from "../../api/rootScope.js";
import { buildTodoBody } from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  todo: "todo",
} as const;

export interface SubmitCreateTodoInput {
  token: string | null;
  sessionId: string | null;
  userId: string | null;
  scope: RootScope | null;
  title: string;
  description: string;
  parentId: string;
  assignedTo: string;
  assignedToCurrentSessionAgent: boolean;
  sessionAgentIds: string[];
  titleRef: RefObject<HTMLInputElement>;
  setBusy(value: boolean): void;
  setSubmitError(value: string | null): void;
  onClose(): void;
  onCreated(): Promise<void>;
}

export async function submitCreateTodo(
  input: SubmitCreateTodoInput,
): Promise<void> {
  const trimmedTitle = input.title.trim();
  if (trimmedTitle.length === 0) {
    input.setSubmitError("Title is required.");
    input.titleRef.current?.focus();
    return;
  }
  if (input.sessionId === null || input.userId === null) {
    input.setSubmitError("No active session.");
    return;
  }
  const sessionId = input.sessionId;

  const body = buildTodoBody({
    userId: input.userId,
    title: trimmedTitle,
    description: input.description.trim(),
    parentId: input.parentId,
    assignedTo: input.assignedTo,
    assignedToCurrentSessionAgent: input.assignedToCurrentSessionAgent,
  });
  const scope = input.scope;
  if (scope === null) {
    input.setSubmitError("No active session.");
    return;
  }

  input.setBusy(true);
  input.setSubmitError(null);
  try {
    await postTodoAndWake(input, sessionId, body, scope);
  } catch (err) {
    input.setBusy(false);
    input.setSubmitError(err instanceof Error ? err.message : String(err));
    return;
  }
  input.onClose();
  await input.onCreated();
}

async function postTodoAndWake(
  input: SubmitCreateTodoInput,
  sessionId: string,
  body: PostTodoBody,
  scope: RootScope,
): Promise<void> {
  const client = createClient({ baseUrl: "", token: input.token });
  const response = await client.postTodo(sessionId, body, scope);
  if (
    body.assigned_to === undefined ||
    !input.sessionAgentIds.includes(body.assigned_to)
  ) {
    return;
  }

  const managedClient = createManagedAgentsClient({
    baseUrl: "",
    token: input.token,
  });
  await managedClient.wakeSession(sessionId, {
    reason: NO_LOOSE_STRING_VALUES.todo,
    source_event: response.filename,
    target_participant_ids: [body.assigned_to],
    ...scopeToBody(scope),
  });
}
