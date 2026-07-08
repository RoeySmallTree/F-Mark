import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { whoOf } from "../format.js";
import { assigneeLabelFor, participantEntries } from "./helpers.js";
import type { TodoItemProps, TodoItemValues } from "./types.js";

interface UseTodoAssigneeControllerInput {
  node: TodoItemProps["node"];
  participants: TodoItemProps["participants"];
  agentIds: TodoItemProps["agentIds"];
  rootRef: RefObject<HTMLDivElement>;
  values: () => TodoItemValues;
  onReassign: TodoItemProps["onReassign"];
}

export function useTodoAssigneeController({
  node,
  participants,
  agentIds,
  rootRef,
  values,
  onReassign,
}: UseTodoAssigneeControllerInput) {
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const assigneeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!assigneeOpen) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) === true) return;
      setAssigneeOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [assigneeOpen, rootRef]);

  const assignee = node.assigned_to
    ? whoOf(node.assigned_to, participants)
    : null;
  const participantsList = useMemo(
    () => participantEntries(participants, agentIds),
    [participants, agentIds],
  );

  async function selectAssignee(participantId: string | null): Promise<void> {
    await onReassign(participantId, values());
    setAssigneeOpen(false);
    assigneeButtonRef.current?.focus();
  }

  function onLocalKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Escape" || !assigneeOpen) return;
    event.stopPropagation();
    setAssigneeOpen(false);
    assigneeButtonRef.current?.focus();
  }

  return {
    assignee,
    assigneeOpen,
    assigneeLabel: assigneeLabelFor(assignee?.name ?? null),
    participantsList,
    assigneeButtonRef,
    selectAssignee,
    onLocalKeyDown,
    toggleAssigneeMenu: () => {
      setAssigneeOpen((value) => !value);
    },
  };
}
