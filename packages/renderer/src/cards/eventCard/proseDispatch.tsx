import { type JSX } from "react";
import type { ProsePayload } from "@f-mark/shared";
import { getProseRole } from "@f-mark/shared";
import { CommentActivityCard } from "../CommentActivityCard.js";
import { FileCommentCard } from "../FileCommentCard.js";
import { HookInvocationCard } from "../HookInvocationCard.js";
import { MessageCard } from "../MessageCard.js";
import { ProseCard } from "../ProseCard.js";
import { whoOf } from "../format.js";
import type { EventCardProps } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  comment: "comment",
  fileComment: "file-comment",
  anchor: "anchor",
  hook: "hook",
  message: "message",
} as const;

export function renderProseEvent(props: EventCardProps): JSX.Element | null {
  const payload = props.event.payload as ProsePayload;
  const role = getProseRole(payload);
  if (role.kind === NO_LOOSE_STRING_VALUES.comment) return <CommentActivityCard {...props} />;
  if (role.kind === NO_LOOSE_STRING_VALUES.fileComment) return <FileCommentCard {...props} />;
  // A user-lane prose with source:"hook" is a prompt F-Mark's composer did not
  // originate (e.g. Codex's injected memory-consolidation prompt). Never render it
  // as a human message bubble — surface it as a folded hook-invocation card.
  // Agent-lane source:"hook" prose (legit streamed output) is untouched.
  if (
    role.kind === NO_LOOSE_STRING_VALUES.message &&
    payload.source === NO_LOOSE_STRING_VALUES.hook &&
    whoOf(props.event.participant_id, props.participants).isUser
  ) {
    return <HookInvocationCard {...props} />;
  }
  if (role.kind === NO_LOOSE_STRING_VALUES.anchor) {
    return (
      <ProseCard
        event={props.event}
        participants={props.participants}
        comments={props.comments}
        blocks={props.blocks}
        commentsByFilename={props.commentsByFilename}
      />
    );
  }
  return (
    <MessageCard
      event={props.event}
      participants={props.participants}
      comments={props.comments}
      revealWords={props.revealWords}
    />
  );
}
