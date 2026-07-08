import { useState, type JSX, type KeyboardEvent } from "react";
import { Check, RotateCcw } from "lucide-react";
import type { AnyEventRecord, ProsePayload } from "@f-mark/shared";
import { whoOf } from "../../cards/format.js";
import type { ParticipantMap } from "./types.js";
import { ThreadMessage } from "./ThreadMessage.js";

const NO_LOOSE_STRING_VALUES = {
  reopen: "Reopen",
  resolve: "Resolve",
  resolved: "Resolved",
} as const;

interface CommentThreadProps {
  root: AnyEventRecord;
  allComments: AnyEventRecord[];
  participants: ParticipantMap;
  resolved: boolean;
  onReply: (root: AnyEventRecord, content: string) => Promise<void>;
  onResolve: (root: AnyEventRecord) => Promise<void>;
  onUnresolve: (root: AnyEventRecord) => Promise<void>;
}

export function CommentThread({
  root,
  allComments,
  participants,
  resolved,
  onReply,
  onResolve,
  onUnresolve,
}: CommentThreadProps): JSX.Element {
  const [replyText, setReplyText] = useState("");
  const replies = getReplies(root, allComments);
  const rootWho = whoOf(root.participant_id, participants);
  const rootContent = (root.payload as ProsePayload).content ?? "";

  async function submitReply(): Promise<void> {
    const trimmed = replyText.trim();
    if (trimmed.length === 0) return;
    setReplyText("");
    await onReply(root, trimmed);
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitReply();
    }
  }

  return (
    <div
      className={["thread", resolved ? "resolved" : ""].join(" ").trim()}
      data-root-filename={root.filename}
    >
      {resolved ? (
        <div className="thread-resolved-bar">
          <span className="thread-resolved-label">
            <Check size={14} aria-hidden />
            {NO_LOOSE_STRING_VALUES.resolved}
          </span>
          <button
            type="button"
            className="thread-reopen-btn"
            onClick={() => void onUnresolve(root)}
          >
            <RotateCcw size={13} aria-hidden />
            {NO_LOOSE_STRING_VALUES.reopen}
          </button>
        </div>
      ) : null}
      <ThreadMessage
        event={root}
        reply={false}
        content={rootContent}
        who={rootWho}
      />
      {replies.map((reply) => {
        const who = whoOf(reply.participant_id, participants);
        const content = (reply.payload as ProsePayload).content ?? "";
        return (
          <ThreadMessage
            key={reply.filename}
            event={reply}
            reply={true}
            content={content}
            who={who}
          />
        );
      })}
      {!resolved ? (
        <div className="thread-actions">
          <input
            type="text"
            className="reply-input"
            placeholder="Reply…"
            value={replyText}
            onChange={(event) => setReplyText(event.target.value)}
            onKeyDown={onKey}
            aria-label={`Reply to ${rootWho.name}`}
          />
          <button
            type="button"
            className="resolve-btn"
            onClick={() => void onResolve(root)}
          >
            <Check size={13} aria-hidden />
            {NO_LOOSE_STRING_VALUES.resolve}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function getReplies(
  root: AnyEventRecord,
  allComments: AnyEventRecord[],
): AnyEventRecord[] {
  return allComments.filter((comment) => {
    const inReplyTo = (comment.payload as { in_reply_to?: string }).in_reply_to;
    return typeof inReplyTo === "string" && inReplyTo === root.filename;
  });
}
