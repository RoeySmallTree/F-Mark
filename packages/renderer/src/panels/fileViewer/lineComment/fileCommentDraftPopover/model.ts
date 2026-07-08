import { useMemo } from "react";
import type { Participant, ProseMention } from "@f-mark/shared";
import { whoOf } from "../../../../cards/format.js";
import { useStore } from "../../../../state/store.js";
import type { LineRange } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  usLocal: "us-local",
  you: "You",
  agent: "agent",
} as const;

export function lineLabel(lines: LineRange): string {
  return lines[0] === lines[1]
    ? `line ${lines[0]}`
    : `lines ${lines[0]}-${lines[1]}`;
}

export function targetPreview(snippet: string, lines: LineRange): string {
  return snippet.length > 0 ? snippet : lineLabel(lines);
}

export function currentFileCommentWho(
  currentUserId: string | null,
  participants: Record<string, Participant>,
) {
  return currentUserId !== null
    ? whoOf(currentUserId, participants)
    : { id: NO_LOOSE_STRING_VALUES.usLocal, name: NO_LOOSE_STRING_VALUES.you, initial: "Y", isUser: true, runtimeId: null };
}

function defaultFileCommentMentions(
  participants: Record<string, Participant>,
  currentSessionId: string | null,
): ProseMention[] {
  return Object.entries(participants)
    .filter(([, p]) => p.kind === NO_LOOSE_STRING_VALUES.agent && p.active_session === currentSessionId)
    .map(([id, p]) => ({
      participant_id: id,
      display_name: p.name,
      token: `@${p.name}`,
    }));
}

/* Default tags when opening a viewer comment draft: every agent currently
   attached to this session (broadcast to all helpers; the user can prune in the
   picker). A file comment has no authoring agent to single out, unlike an
   event-anchored comment, so we don't special-case one. */
export function useDefaultFileCommentMentions(): ProseMention[] {
  const participants = useStore((s) => s.participants);
  const currentSessionId = useStore((s) => s.currentSessionId);
  return useMemo<ProseMention[]>(
    () => defaultFileCommentMentions(participants, currentSessionId),
    [participants, currentSessionId],
  );
}
