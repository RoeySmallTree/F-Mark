import type { CSSProperties, JSX } from "react";
import {
  Bot,
  Check,
  MessageSquare,
  Pencil,
  RotateCcw,
  SendHorizontal,
  SmilePlus,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import type {
  AnyEventRecord,
  Participant,
  ProseMention,
  ProsePayload,
} from "@f-mark/shared";
import { PARTICIPANT_KINDS } from "@f-mark/shared";
import { formatWhen, whoOf } from "../../../cards/format.js";
import { ParticipantAvatar } from "../../../components/ParticipantAvatar.js";
import { MarkdownRenderer } from "../../../render/MarkdownRenderer.js";
import {
  COMMENT_EMOJIS,
  contentOf,
  lineLabel,
  shortPreview,
  type CommentGroup,
  type CommentNode,
} from "./commentModel.js";
import type { CommentThreadActions } from "./useRightCommentsController.js";

const threadClassStates = {
  active: "active",
  passive: "passive",
  empty: "",
  reply: "reply",
  resolved: "resolved",
} as const;

const commentCountLabels = {
  singular: "comment",
  plural: "comments",
  replySingular: "reply",
  replyPlural: "replies",
} as const;

const commentActionLabels = {
  reopen: "Reopen",
  resolved: "Resolved",
  resolve: "Resolve",
} as const;

const keyboardKeys = {
  escape: "Escape",
  enter: "Enter",
} as const;

const avatarSizes = {
  small: "sm",
} as const;

const MAX_PARTICIPANT_STACK = 4;

type Who = ReturnType<typeof whoOf>;

/** Same total order the thread model uses (timestamp, then filename), so the
    folded preview and participant order never disagree with the expanded view
    on tied timestamps. */
function compareByTimeThenName(a: AnyEventRecord, b: AnyEventRecord): number {
  const byTime = a.timestamp.localeCompare(b.timestamp);
  return byTime !== 0 ? byTime : a.filename.localeCompare(b.filename);
}

/** Distinct participants across the thread, in first-appearance (chronological)
    order. */
function threadParticipants(
  messages: AnyEventRecord[],
  participants: Record<string, Participant>,
): Who[] {
  const seen = new Set<string>();
  const out: Who[] = [];
  for (const message of messages) {
    const who = whoOf(message.participant_id, participants);
    if (seen.has(who.id)) continue;
    seen.add(who.id);
    out.push(who);
  }
  return out;
}

interface ThreadCardProps {
  group: CommentGroup;
  participants: Record<string, Participant>;
  currentWho: ReturnType<typeof whoOf>;
  active: boolean;
  style?: CSSProperties;
  replyDrafts: Record<string, string>;
  replyMentions: Record<string, ProseMention[]>;
  editing: Record<string, string>;
  busyKey: string | null;
  actions: CommentThreadActions;
}

export function ThreadCard({
  group,
  participants,
  currentWho,
  active,
  style,
  replyDrafts,
  replyMentions,
  editing,
  busyKey,
  actions,
}: ThreadCardProps): JSX.Element {
  const ordered = group.roots
    .flatMap((root) => [root.event, ...root.replies])
    .sort(compareByTimeThenName);
  const messageCount = ordered.length;
  const replyCount = messageCount - group.roots.length;
  const people = threadParticipants(ordered, participants);
  const latest = ordered[ordered.length - 1];
  const latestWho =
    latest === undefined ? null : whoOf(latest.participant_id, participants);

  return (
    <article
      className={[
        "right-comments-thread",
        active ? threadClassStates.active : threadClassStates.passive,
      ]
        .join(" ")
        .trim()}
      style={style}
      data-thread-key={group.key}
      onClick={() => actions.onFocus(group)}
    >
      <div className="right-comments-thread-head">
        <MessageSquare size={14} aria-hidden />
        <div>
          <b title={group.title}>{group.title}</b>
          <span>
            {lineLabel(group.lines)} · {messageCount}{" "}
            {messageCount === 1
              ? commentCountLabels.singular
              : commentCountLabels.plural}
          </span>
        </div>
        {replyCount > 0 ? (
          <span className="right-comments-reply-badge">
            {replyCount}{" "}
            {replyCount === 1
              ? commentCountLabels.replySingular
              : commentCountLabels.replyPlural}
          </span>
        ) : null}
        {active && (
          <button
            type="button"
            className="right-comments-thread-close"
            aria-label="Close comment focus"
            title="Close (Esc)"
            onClick={(e) => {
              e.stopPropagation();
              actions.onClose();
            }}
          >
            <XCircle size={14} aria-hidden />
          </button>
        )}
      </div>
      {group.quote !== null ? (
        <blockquote className="right-comments-quote">{group.quote}</blockquote>
      ) : null}
      {!active && latest !== undefined && latestWho !== null ? (
        <div className="right-comment-fold">
          {people.length > 0 ? (
            <div
              className="right-comment-people"
              role="img"
              aria-label={`Participants: ${people
                .map((who) => who.name)
                .join(", ")}`}
            >
              {people.slice(0, MAX_PARTICIPANT_STACK).map((who) => (
                <span className="right-comment-people-avatar" key={who.id}>
                  <ParticipantAvatar
                    participantId={who.id}
                    kind={
                      who.isUser
                        ? PARTICIPANT_KINDS.user
                        : PARTICIPANT_KINDS.agent
                    }
                    name={who.name}
                    color={who.color}
                    runtimeId={who.runtimeId}
                    size={avatarSizes.small}
                  />
                </span>
              ))}
              {people.length > MAX_PARTICIPANT_STACK ? (
                <span className="right-comment-people-more">
                  +{people.length - MAX_PARTICIPANT_STACK}
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="right-comment-fold-latest">
            {replyCount > 0 ? (
              <span className="right-comment-fold-latest-label">Latest</span>
            ) : null}
            <b>{latestWho.name}</b> {shortPreview(contentOf(latest), 88)}
          </p>
        </div>
      ) : null}
      {active ? (
        <div className="right-comment-expanded">
          {group.roots.map((root) => (
            <CommentRoot
              key={root.event.filename}
              group={group}
              root={root}
              participants={participants}
              currentWho={currentWho}
              replyDraft={replyDrafts[root.event.filename] ?? ""}
              replyMentions={replyMentions[root.event.filename] ?? []}
              editing={editing}
              busyKey={busyKey}
              actions={actions}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

interface CommentRootProps {
  group: CommentGroup;
  root: CommentNode;
  participants: Record<string, Participant>;
  currentWho: ReturnType<typeof whoOf>;
  replyDraft: string;
  replyMentions: ProseMention[];
  editing: Record<string, string>;
  busyKey: string | null;
  actions: CommentThreadActions;
}

function CommentRoot({
  group,
  root,
  participants,
  currentWho,
  replyDraft,
  replyMentions,
  editing,
  busyKey,
  actions,
}: CommentRootProps): JSX.Element {
  const rootBusy =
    busyKey?.includes(root.event.filename) === true &&
    (busyKey.startsWith("resolve:") ||
      busyKey.startsWith("unresolve:") ||
      busyKey.startsWith("reply:") ||
      busyKey.startsWith("emoji:"));
  const resolveBusy = busyKey === `resolve:${root.event.filename}`;
  const unresolveBusy = busyKey === `unresolve:${root.event.filename}`;
  return (
    <section
      className={["right-comment-root", root.resolved ? "resolved" : ""]
        .join(" ")
        .trim()}
    >
      {root.resolved ? (
        <div className="right-comment-resolved-bar">
          <span className="right-comment-resolved-label">
            <Check size={14} aria-hidden />
            {commentActionLabels.resolved}
          </span>
          <button
            type="button"
            className="right-comment-reopen"
            disabled={busyKey !== null}
            aria-busy={unresolveBusy}
            onClick={(e) => {
              e.stopPropagation();
              void actions.onUnresolve(group, root.event);
            }}
          >
            <RotateCcw size={13} aria-hidden />
            {commentActionLabels.reopen}
          </button>
        </div>
      ) : null}
      <CommentMessage
        group={group}
        event={root.event}
        participants={participants}
        reply={false}
        editing={editing}
        busyKey={busyKey}
        actions={actions}
      />
      {root.replies.map((reply) => (
        <CommentMessage
          key={reply.filename}
          group={group}
          event={reply}
          participants={participants}
          reply={true}
          editing={editing}
          busyKey={busyKey}
          actions={actions}
        />
      ))}
      {!root.resolved ? (
        <div className="right-comment-tools" onClick={(e) => e.stopPropagation()}>
          <div className="right-comment-composer right-comment-replybox">
            <ParticipantAvatar
              participantId={currentWho.id}
              kind={
                currentWho.isUser
                  ? PARTICIPANT_KINDS.user
                  : PARTICIPANT_KINDS.agent
              }
              name={currentWho.name}
              color={currentWho.color}
              runtimeId={currentWho.runtimeId}
              size={avatarSizes.small}
            />
            <input
              ref={(node) => actions.onReplyInputRef(root.event, node)}
              type="text"
              value={replyDraft}
              placeholder="Reply…"
              aria-label={`Reply to ${whoOf(root.event.participant_id, participants).name}`}
              onChange={(e) => {
                actions.onReplyDraft(root.event, e.target.value);
                if (e.target.value.endsWith("@")) {
                  actions.onOpenMentions(
                    root.event,
                    e.currentTarget.getBoundingClientRect(),
                  );
                }
              }}
              onKeyDown={(e) => actions.onReplyKey(e, group, root.event)}
            />
            <div className="right-comment-composer-actions">
              <button
                type="button"
                className={[
                  "right-comment-icon-btn",
                  replyMentions.length > 0
                    ? threadClassStates.active
                    : threadClassStates.empty,
                ]
                  .join(" ")
                  .trim()}
                aria-label="Mention agent"
                title="Mention agent"
                onClick={(e) =>
                  actions.onOpenMentions(
                    root.event,
                    e.currentTarget.getBoundingClientRect(),
                  )
                }
                disabled={busyKey !== null}
              >
                <Bot size={13} aria-hidden />
              </button>
              <button
                type="button"
                className={[
                  "right-comment-icon-btn",
                  replyDraft.trim().length > 0 ? "primary" : "",
                ]
                  .join(" ")
                  .trim()}
                aria-label="Send reply"
                onClick={() => void actions.onSubmitReply(group, root.event)}
                disabled={busyKey !== null || replyDraft.trim().length === 0}
              >
                <SendHorizontal size={13} aria-hidden />
              </button>
            </div>
          </div>
          <div className="right-comment-toolbar right-comment-secondary-actions">
            <div className="right-comment-emoji-row" aria-label="Add reaction">
              <SmilePlus size={12} aria-hidden />
              {COMMENT_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`React ${emoji}`}
                  onClick={() => void actions.onEmoji(group, root.event, emoji)}
                  disabled={busyKey !== null}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="right-comment-resolve"
              disabled={busyKey !== null || rootBusy}
              aria-busy={resolveBusy}
              onClick={() => void actions.onResolve(group, root.event)}
            >
              <Check size={12} aria-hidden />
              {commentActionLabels.resolve}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface CommentMessageProps {
  group: CommentGroup;
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  reply: boolean;
  editing: Record<string, string>;
  busyKey: string | null;
  actions: CommentThreadActions;
}

function CommentMessage({
  group,
  event,
  participants,
  reply,
  editing,
  busyKey,
  actions,
}: CommentMessageProps): JSX.Element {
  const who = whoOf(event.participant_id, participants);
  const editText = editing[event.filename];
  const isEditing = editText !== undefined;
  const mentions = (event.payload as ProsePayload).mentions ?? [];

  return (
    <div
      className={[
        "right-comment-msg",
        reply ? threadClassStates.reply : threadClassStates.empty,
      ]
        .join(" ")
        .trim()}
      data-comment-event-id={event.filename}
    >
      <ParticipantAvatar
        participantId={who.id}
        kind={who.isUser ? PARTICIPANT_KINDS.user : PARTICIPANT_KINDS.agent}
        name={who.name}
        color={who.color}
        runtimeId={who.runtimeId}
        size={avatarSizes.small}
      />
      <div className="right-comment-msg-body" onClick={(e) => e.stopPropagation()}>
        <div className="right-comment-msg-meta">
          <b>{who.name}</b>
          <span>{formatWhen(event.timestamp)}</span>
        </div>
        {isEditing ? (
          <div className="right-comment-edit">
            <textarea
              value={editText}
              rows={3}
              onChange={(e) => actions.onEditDraft(event, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === keyboardKeys.escape) {
                  e.preventDefault();
                  actions.onCancelEdit(event);
                }
                if ((e.metaKey || e.ctrlKey) && e.key === keyboardKeys.enter) {
                  e.preventDefault();
                  void actions.onSaveEdit(group, event);
                }
              }}
            />
            <div>
              <button
                type="button"
                className="right-comment-icon-btn"
                aria-label="Cancel edit"
                onClick={() => actions.onCancelEdit(event)}
              >
                <X size={13} aria-hidden />
              </button>
              <button
                type="button"
                className="right-comment-icon-btn primary"
                aria-label="Save edit"
                disabled={busyKey !== null || editText.trim().length === 0}
                onClick={() => void actions.onSaveEdit(group, event)}
              >
                <Check size={13} aria-hidden />
              </button>
            </div>
          </div>
        ) : (
          <>
            <MarkdownRenderer
              content={contentOf(event)}
              className="right-comment-markdown"
            />
            {mentions.length > 0 ? (
              <div className="right-comment-mentions" aria-label="Tagged agents">
                {mentions.map((mention) => {
                  const participant = participants[mention.participant_id];
                  return (
                    <span
                      key={mention.participant_id}
                      className="right-comment-mention-chip"
                    >
                      <ParticipantAvatar
                        participantId={mention.participant_id}
                        participant={participant}
                        kind={PARTICIPANT_KINDS.agent}
                        name={mention.display_name}
                        color={participant?.color}
                        runtimeId={participant?.runtime_id ?? null}
                        size={avatarSizes.small}
                      />
                      {mention.display_name}
                    </span>
                  );
                })}
              </div>
            ) : null}
            <div className="right-comment-msg-actions">
              <button
                type="button"
                aria-label="Edit comment"
                onClick={() => actions.onStartEdit(event)}
              >
                <Pencil size={12} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Remove comment"
                disabled={busyKey !== null}
                onClick={() => void actions.onRemove(group, event)}
              >
                <Trash2 size={12} aria-hidden />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
