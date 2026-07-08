import { useMemo, useState } from "react";
import { useCurrentSessionRootScope } from "../../hooks/useCurrentSessionRootScope.js";
import { flattenTreeForDropdown } from "../../panels/todoPanelUtils.js";
import { useStore } from "../../state/store.js";
import { createTodoActions } from "./createTodoActions.js";
import type {
  CreateTodoPopoverController,
  CreateTodoPopoverProps,
} from "./types.js";
import { useCreateTodoAssignee } from "./useCreateTodoAssignee.js";
import { useCreateTodoFields } from "./useCreateTodoFields.js";
import { useTodoRoots } from "./useTodoRoots.js";

type ControllerProps = Pick<
  CreateTodoPopoverProps,
  "onClose" | "onCreated"
>;

export function useCreateTodoPopoverController({
  onClose,
  onCreated,
}: ControllerProps): CreateTodoPopoverController {
  const token = useStore((s) => s.token);
  const sessionId = useStore((s) => s.currentSessionId);
  const userId = useStore((s) => s.currentUserId);
  const participants = useStore((s) => s.participants);
  const scope = useCurrentSessionRootScope(sessionId);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = useCreateTodoFields();
  const assignee = useCreateTodoAssignee(participants, sessionId);
  const todoRoots = useTodoRoots({ sessionId, token, scope });
  const parentOptions = useMemo(
    () => flattenTreeForDropdown(todoRoots.roots),
    [todoRoots.roots],
  );
  const actions = createTodoActions({
    token,
    sessionId,
    userId,
    scope,
    fields,
    assignee,
    submitError,
    setSubmitError,
    busy,
    setBusy,
    onClose,
    onCreated,
  });

  return {
    ...fields,
    assignedTo: assignee.assignedTo,
    setAssignedTo: assignee.setAssignedTo,
    parentOptions,
    participantOptions: assignee.participantOptions,
    loadingTodos: todoRoots.loadingTodos,
    loadError: todoRoots.loadError,
    ...actions,
  };
}
