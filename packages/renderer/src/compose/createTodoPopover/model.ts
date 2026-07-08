import type { Participant } from "@f-mark/shared";
import type { PostTodoBody } from "../../api/client.js";
import { generateTodoId } from "../../panels/todoPanelUtils.js";
import type { ParticipantOption } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  open: "open",
} as const;

interface TodoBodyInput {
  userId: string;
  title: string;
  description: string;
  parentId: string;
  assignedTo: string;
  assignedToCurrentSessionAgent: boolean;
}

function participantName(participant: { name: string }): string {
  return participant.name;
}

export function formatParentLabel(title: string, depth: number): string {
  const trimmed = title.trim();
  const label = trimmed.length > 0 ? trimmed : "Untitled task";
  return `${"··· ".repeat(depth)}${label}`;
}

export function participantOptionsForAgents(
  participants: Record<string, Participant>,
  sessionAgentIds: string[],
): ParticipantOption[] {
  return sessionAgentIds
    .map((id) => {
      const participant = participants[id];
      if (participant === undefined) return null;
      return {
        id,
        label: participantName(participant),
      };
    })
    .filter((option): option is ParticipantOption => option !== null)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildTodoBody(input: TodoBodyInput): PostTodoBody {
  const body: PostTodoBody = {
    participant_id: input.userId,
    id: generateTodoId(),
    title: input.title,
    status: NO_LOOSE_STRING_VALUES.open,
  };
  if (input.description.length > 0) body.body = input.description;
  if (input.parentId.length > 0) body.parent_id = input.parentId;
  if (input.assignedToCurrentSessionAgent) body.assigned_to = input.assignedTo;
  return body;
}

export function canCreateTodo(input: {
  title: string;
  busy: boolean;
  sessionId: string | null;
  userId: string | null;
}): boolean {
  return (
    input.title.trim().length > 0 &&
    !input.busy &&
    input.sessionId !== null &&
    input.userId !== null
  );
}
