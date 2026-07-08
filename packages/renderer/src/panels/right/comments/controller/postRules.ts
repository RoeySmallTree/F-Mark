import type { Participant, ProseMention } from "@f-mark/shared";
import { readCommentEndsTurn } from "../../../../state/settings.js";
import {
  COMMENT_EMOJIS,
  type CommentGroup,
} from "../commentModel.js";
import type { CommentPostBody } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
} as const;

export function wakeTargetsForComment(
  group: CommentGroup,
  mentions: ProseMention[] | undefined,
  participants: Record<string, Participant>,
): string[] {
  const ids = new Set<string>();
  for (const mention of mentions ?? []) ids.add(mention.participant_id);
  const targetParticipantId = group.target?.participant_id;
  if (
    targetParticipantId !== undefined &&
    participants[targetParticipantId]?.kind === NO_LOOSE_STRING_VALUES.agent
  ) {
    ids.add(targetParticipantId);
  }
  return [...ids];
}

export function shouldEndTurnAfterComment(body: CommentPostBody): boolean {
  return (
    readCommentEndsTurn() &&
    body.supersedes === undefined &&
    !COMMENT_EMOJIS.includes(body.content)
  );
}
