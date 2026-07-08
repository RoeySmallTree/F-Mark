import type {
  Participant,
  ProseMention,
} from "@f-mark/shared";
import { whoOf } from "../format.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
  usLocal: "us-local",
  you: "You",
} as const;

export function defaultLineCommentMentions({
  participants,
  authorId,
  currentSessionId,
}: {
  participants: Record<string, Participant>;
  authorId: string;
  currentSessionId: string | null;
}): ProseMention[] {
  const author = participants[authorId];
  if (author !== undefined && author.kind === NO_LOOSE_STRING_VALUES.agent) {
    return [
      {
        participant_id: authorId,
        display_name: author.name,
        token: `@${author.name}`,
      },
    ];
  }
  return Object.entries(participants)
    .filter(([, p]) => p.kind === NO_LOOSE_STRING_VALUES.agent && p.active_session === currentSessionId)
    .map(([id, p]) => ({
      participant_id: id,
      display_name: p.name,
      token: `@${p.name}`,
    }));
}

export function currentCommentWho(
  currentUserId: string | null,
  participants: Record<string, Participant>,
) {
  return currentUserId !== null
    ? whoOf(currentUserId, participants)
    : { id: NO_LOOSE_STRING_VALUES.usLocal, name: NO_LOOSE_STRING_VALUES.you, initial: "Y", isUser: true, runtimeId: null };
}
