import type { Participant } from "@f-mark/shared";
import { whoOf } from "../format.js";
import type { TodoAssigneeOption } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  todoItem: "todo-item",
  done: "done",
  wip: "wip",
  compact: "compact",
  draft: "draft",
  unassigned: "Unassigned",
  subtask: "subtask",
  subtasks: "subtasks",
} as const;

export function depthOffset(depth: number): string {
  if (depth <= 0) return "0px";
  const steps = Array.from(
    { length: depth },
    () => "var(--todo-indent-step)",
  );
  return `calc(${steps.join(" + ")})`;
}

export function participantEntries(
  participants: Record<string, Participant>,
  agentIds: string[],
): TodoAssigneeOption[] {
  return agentIds
    .map((participantId): TodoAssigneeOption | null => {
      const participant = participants[participantId];
      if (participant === undefined) return null;
      return {
        participantId,
        participant,
        name: whoOf(participantId, participants).name,
      };
    })
    .filter((entry): entry is TodoAssigneeOption => entry !== null)
    .sort((a, b) => a.participant.name.localeCompare(b.participant.name));
}

export function todoItemClassName(input: {
  done: boolean;
  wip: boolean;
  compact: boolean;
  draft: boolean;
}): string {
  return [
    NO_LOOSE_STRING_VALUES.todoItem,
    input.done ? NO_LOOSE_STRING_VALUES.done : "",
    input.wip ? NO_LOOSE_STRING_VALUES.wip : "",
    input.compact ? NO_LOOSE_STRING_VALUES.compact : "",
    input.draft ? NO_LOOSE_STRING_VALUES.draft : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function titleLabelFor(title: string): string {
  return title.length > 0 ? title : "untitled task";
}

export function assigneeLabelFor(name: string | null): string {
  return name === null ? NO_LOOSE_STRING_VALUES.unassigned : `Assigned to ${name}`;
}

export function removeConfirmTitle(descendantCount: number): string {
  if (descendantCount === 0) return "Remove this task?";
  const noun =
    descendantCount === 1
      ? NO_LOOSE_STRING_VALUES.subtask
      : NO_LOOSE_STRING_VALUES.subtasks;
  return `Remove this task and ${descendantCount} ${noun}?`;
}
