import { MessageSquareReply } from "lucide-react";
import type {
  AnyEventRecord,
  Participant,
  ProsePayload,
} from "@f-mark/shared";
import { getCommentTarget } from "@f-mark/shared";
import { ParticipantAvatar } from "../components/ParticipantAvatar.js";
import { useStore } from "../state/store.js";
import { formatWhen, whoOf } from "./format.js";

type LineRange = [number, number];

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  allEvents: AnyEventRecord[];
}

function shortPreview(text: string, max = 92): string {
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

function titleForTarget(target: AnyEventRecord | undefined, fallback: string): string {
  if (target?.kind !== "prose") return fallback;
  const payload = target.payload as ProsePayload;
  if (typeof payload.name === "string" && payload.name.trim().length > 0) {
    return payload.name.trim();
  }
  const preview = shortPreview(payload.content, 44);
  return preview.length > 0 ? preview : fallback;
}

function targetSnippet(
  target: AnyEventRecord | undefined,
  lines: LineRange | undefined,
): string | null {
  if (target?.kind !== "prose") return null;
  const content = (target.payload as ProsePayload).content ?? "";
  if (content.trim().length === 0) return null;
  if (lines === undefined) return shortPreview(content, 120);
  const all = content.split(/\r?\n/);
  const start = Math.max(1, lines[0]);
  const end = Math.min(all.length, Math.max(start, lines[1]));
  if (start > all.length) return null;
  return shortPreview(all.slice(start - 1, end).join(" "), 120);
}

export function CommentActivityCard({
  event,
  participants,
  allEvents,
}: Props): JSX.Element | null {
  const currentUserId = useStore((s) => s.currentUserId);
  const setCommentTarget = useStore((s) => s.setCommentTarget);
  const setFocusedCommentId = useStore((s) => s.setFocusedCommentId);
  const setRightTab = useStore((s) => s.setRightTab);
  const payload = event.payload as ProsePayload;
  const target = getCommentTarget(payload);
  if (target === undefined) return null;
  const targetAnchor = target.anchor;
  const targetLines = target.lines;

  const targetEvent = allEvents.find((item) => item.filename === targetAnchor);
  const who = whoOf(event.participant_id, participants);
  const isReply =
    typeof payload.in_reply_to === "string" && payload.in_reply_to.length > 0;
  const actor = event.participant_id === currentUserId ? "You" : who.name;
  const verb = isReply ? "responded" : "commented";
  const title = titleForTarget(targetEvent, targetAnchor);
  const label = lineLabel(targetLines);
  const commentPreview = shortPreview(payload.content, 110);
  const quote = targetSnippet(targetEvent, targetLines);

  function focusComment(): void {
    setCommentTarget(
      targetLines === undefined
        ? { kind: "event", file: targetAnchor }
        : { kind: "event", file: targetAnchor, lines: targetLines },
    );
    setFocusedCommentId(event.filename);
    setRightTab("comments");
  }

  return (
    <button
      type="button"
      className="comment-activity-card"
      data-event-kind="comment-activity"
      onClick={focusComment}
      aria-label={`${actor} ${verb} on ${title}`}
    >
      <span className="comment-activity-icon" aria-hidden>
        <MessageSquareReply size={15} />
      </span>
      <ParticipantAvatar
        participantId={who.id}
        kind={who.isUser ? "user" : "agent"}
        name={who.name}
        color={who.color}
        runtimeId={who.runtimeId}
        size="sm"
      />
      <span className="comment-activity-main">
        <span className="comment-activity-title">
          <b>{actor}</b> {verb} on <b>{title}</b>
          {label.length > 0 ? <span> · {label}</span> : null}
        </span>
        <span className="comment-activity-preview">{commentPreview}</span>
        {quote !== null ? (
          <span className="comment-activity-target">{quote}</span>
        ) : null}
      </span>
      <span className="comment-activity-time">{formatWhen(event.timestamp)}</span>
    </button>
  );
}
