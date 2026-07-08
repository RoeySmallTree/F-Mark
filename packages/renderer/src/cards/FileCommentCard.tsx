import { FileDiff } from "lucide-react";
import type {
  AnyEventRecord,
  Participant,
  ProsePayload,
} from "@f-mark/shared";
import { getFileCommentTarget } from "@f-mark/shared";
import { ParticipantAvatar } from "../components/ParticipantAvatar.js";
import {
  CommentFileRef,
  CommentQuoteBlock,
} from "../components/CommentQuoteParts.js";
import { quoteFromLineContext } from "../comments/commentQuote.js";
import { useStore } from "../state/store.js";
import { formatWhen, whoOf } from "./format.js";

const NO_LOOSE_STRING_VALUES = {
  you: "You",
  responded: "responded",
  commented: "commented",
  file: "file",
  comments: "comments",
  user: "user",
  agent: "agent",
  sm: "sm",
} as const;

type LineRange = [number, number];

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  allEvents: AnyEventRecord[];
}

function shortPreview(text: string, max = 110): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function lineLabel(lines: LineRange | undefined): string {
  if (lines === undefined) return "";
  return lines[0] === lines[1]
    ? `line ${lines[0]}`
    : `lines ${lines[0]}-${lines[1]}`;
}

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

/** Card for a file/diff comment in the feed. Mirrors CommentActivityCard but
 *  targets a repo path (+ line range / diff hunk) rather than an event. */
export function FileCommentCard({
  event,
  participants,
}: Props): JSX.Element | null {
  const currentUserId = useStore((s) => s.currentUserId);
  const setCommentTarget = useStore((s) => s.setCommentTarget);
  const setFocusedCommentId = useStore((s) => s.setFocusedCommentId);
  const setRightTab = useStore((s) => s.setRightTab);

  const payload = event.payload as ProsePayload;
  const target = getFileCommentTarget(payload);
  if (target === undefined) return null;

  const who = whoOf(event.participant_id, participants);
  const isReply =
    typeof payload.in_reply_to === "string" && payload.in_reply_to.length > 0;
  const actor = event.participant_id === currentUserId ? NO_LOOSE_STRING_VALUES.you : who.name;
  const verb = isReply ? NO_LOOSE_STRING_VALUES.responded : NO_LOOSE_STRING_VALUES.commented;
  const label = lineLabel(target.lines);
  const commentPreview = shortPreview(payload.content);
  const name = baseName(target.file_path);
  const quote = quoteFromLineContext(payload);
  const quoteMultiline = quote !== null && quote.includes("\n");

  function focusComment(): void {
    setCommentTarget({
      kind: NO_LOOSE_STRING_VALUES.file,
      file_path: target!.file_path,
      ...(target!.lines !== undefined ? { lines: target!.lines } : {}),
      ...(target!.hunk !== undefined ? { diff_hunk: target!.hunk } : {}),
      ...(target!.base !== undefined ? { diff_base: target!.base } : {}),
      ...(payload.line_context !== undefined
        ? { line_context: payload.line_context }
        : {}),
    });
    setFocusedCommentId(event.filename);
    setRightTab(NO_LOOSE_STRING_VALUES.comments);
  }

  return (
    <article
      className="comment-activity-card"
      data-event-kind="file-comment-activity"
      onClick={focusComment}
      title={target.file_path}
    >
      <button
        type="button"
        className="comment-activity-hitbox"
        aria-label={`${actor} ${verb} on ${target.file_path}`}
        title={target.file_path}
      />
      <span className="comment-activity-icon" aria-hidden>
        <FileDiff size={15} />
      </span>
      <ParticipantAvatar
        participantId={who.id}
        kind={who.isUser ? NO_LOOSE_STRING_VALUES.user : NO_LOOSE_STRING_VALUES.agent}
        name={who.name}
        color={who.color}
        runtimeId={who.runtimeId}
        size={NO_LOOSE_STRING_VALUES.sm}
      />
      <span className="comment-activity-main">
        <span className="comment-activity-title">
          <b>{actor}</b> {verb} on <b>{name}</b>
          {label.length > 0 ? <span> · {label}</span> : null}
        </span>
        <CommentFileRef filePath={target.file_path} lines={target.lines} />
        <span className="comment-activity-preview">{commentPreview}</span>
        {quote !== null ? (
          <CommentQuoteBlock quote={quote} multiline={quoteMultiline} />
        ) : null}
      </span>
      <span className="comment-activity-time">
        {formatWhen(event.timestamp)}
      </span>
    </article>
  );
}
