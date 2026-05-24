import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
} from "react";
import {
  Check,
  MessageSquare,
  Pencil,
  SendHorizontal,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import type {
  AnyEventRecord,
  Participant,
  ProsePayload,
} from "@f-mark/shared";
import { getCommentTarget } from "@f-mark/shared";
import { createClient, type PostProseBody } from "../../api/client.js";
import { formatWhen, whoOf } from "../../cards/format.js";
import { useStore } from "../../state/store.js";

type LineRange = [number, number];

interface CommentNode {
  event: AnyEventRecord;
  replies: AnyEventRecord[];
  resolved: boolean;
}

interface CommentGroup {
  key: string;
  targetFile: string;
  lines?: LineRange;
  target?: AnyEventRecord;
  title: string;
  quote: string | null;
  roots: CommentNode[];
  anchorOrder: string;
}

interface LayoutState {
  positions: Record<string, number>;
  height: number;
}

const EMOJIS = ["👍", "❤️", "👀", "✅"];
const PASSIVE_HEIGHT = 82;
const LINE_HEIGHT = 25;
const CARD_GAP = 12;

function lineKey(lines: LineRange | undefined): string {
  return lines === undefined ? "all" : `${lines[0]}:${lines[1]}`;
}

function targetKey(file: string, lines: LineRange | undefined): string {
  return `${file}::${lineKey(lines)}`;
}

function lineLabel(lines: LineRange | undefined): string {
  if (lines === undefined) return "whole item";
  return lines[0] === lines[1]
    ? `line ${lines[0]}`
    : `lines ${lines[0]}-${lines[1]}`;
}

function contentOf(event: AnyEventRecord): string {
  return (event.payload as ProsePayload).content ?? "";
}

function trimmedContentOf(event: AnyEventRecord): string {
  return contentOf(event).trim();
}

function isRemovedMarker(event: AnyEventRecord): boolean {
  const payload = event.payload as ProsePayload;
  return payload.content.trim() === "_removed_" && typeof payload.supersedes === "string";
}

function isResolvedMarker(event: AnyEventRecord): boolean {
  const payload = event.payload as ProsePayload;
  return payload.content.trim() === "_resolved_" && typeof payload.supersedes === "string";
}

function isMarker(event: AnyEventRecord): boolean {
  return isRemovedMarker(event) || isResolvedMarker(event);
}

function supersedesOf(event: AnyEventRecord): string | undefined {
  const supersedes = (event.payload as ProsePayload).supersedes;
  return typeof supersedes === "string" && supersedes.length > 0
    ? supersedes
    : undefined;
}

function inReplyToOf(event: AnyEventRecord): string | undefined {
  const inReplyTo = (event.payload as ProsePayload).in_reply_to;
  return typeof inReplyTo === "string" && inReplyTo.length > 0
    ? inReplyTo
    : undefined;
}

function shortPreview(text: string, max = 130): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function deriveTargetTitle(target: AnyEventRecord | undefined, file: string): string {
  if (target === undefined) return file;
  if (target.kind !== "prose") return file;
  const payload = target.payload as ProsePayload;
  if (typeof payload.name === "string" && payload.name.trim().length > 0) {
    return payload.name.trim();
  }
  const content = shortPreview(payload.content, 44);
  return content.length > 0 ? content : file;
}

function extractQuote(
  target: AnyEventRecord | undefined,
  lines: LineRange | undefined,
): string | null {
  if (target === undefined || target.kind !== "prose") return null;
  const content = (target.payload as ProsePayload).content ?? "";
  if (content.trim().length === 0) return null;
  if (lines === undefined) return shortPreview(content, 170);
  const all = content.split(/\r?\n/);
  const start = Math.max(1, lines[0]);
  const end = Math.min(all.length, Math.max(start, lines[1]));
  if (start > all.length) return null;
  return shortPreview(all.slice(start - 1, end).join("\n"), 170);
}

function cssEscape(value: string): string {
  if (
    typeof CSS !== "undefined" &&
    typeof CSS.escape === "function"
  ) {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

function findTargetElement(filename: string): HTMLElement | null {
  const selector = `[data-event-filename="${cssEscape(filename)}"]`;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
  for (const candidate of candidates) {
    const content = candidate.querySelector<HTMLElement>(".commentable-content");
    if (content !== null) return content;
  }
  return candidates[0] ?? null;
}

function scrollByAmount(el: HTMLElement, top: number): void {
  if (typeof el.scrollBy === "function") {
    el.scrollBy({ top, behavior: "smooth" });
  } else {
    el.scrollTop += top;
  }
}

function scrollToTop(el: HTMLElement, top: number): void {
  if (typeof el.scrollTo === "function") {
    el.scrollTo({ top, behavior: "auto" });
  } else {
    el.scrollTop = top;
  }
}

function alignFeedAnchorToCard(group: CommentGroup, card: HTMLElement): void {
  const feed = document.querySelector<HTMLElement>(".feed-scroll");
  const targetEl = findTargetElement(group.targetFile);
  if (feed === null || targetEl === null) return;
  const lineOffset =
    group.lines === undefined ? 0 : (group.lines[0] - 1) * LINE_HEIGHT;
  const anchorTop = targetEl.getBoundingClientRect().top + lineOffset;
  const cardTop = card.getBoundingClientRect().top;
  scrollByAmount(feed, anchorTop - cardTop);
}

function buildCommentGroups(events: AnyEventRecord[]): CommentGroup[] {
  const targets = new Map(events.map((event) => [event.filename, event]));
  const buckets = new Map<
    string,
    { targetFile: string; lines?: LineRange; comments: AnyEventRecord[] }
  >();

  for (const event of events) {
    if (event.kind !== "prose") continue;
    const target = getCommentTarget(event.payload as ProsePayload);
    if (target === undefined) continue;
    const key = targetKey(target.anchor, target.lines);
    const existing = buckets.get(key);
    if (existing === undefined) {
      buckets.set(key, {
        targetFile: target.anchor,
        ...(target.lines === undefined ? {} : { lines: target.lines }),
        comments: [event],
      });
    } else {
      existing.comments.push(event);
    }
  }

  const groups: CommentGroup[] = [];
  for (const [key, bucket] of buckets) {
    const roots = buildThreads(bucket.comments);
    if (roots.length === 0) continue;
    const target = targets.get(bucket.targetFile);
    groups.push({
      key,
      targetFile: bucket.targetFile,
      ...(bucket.lines === undefined ? {} : { lines: bucket.lines }),
      target,
      title: deriveTargetTitle(target, bucket.targetFile),
      quote: extractQuote(target, bucket.lines),
      roots,
      anchorOrder: `${bucket.targetFile}:${lineKey(bucket.lines)}`,
    });
  }

  return groups.sort((a, b) => a.anchorOrder.localeCompare(b.anchorOrder));
}

function buildThreads(comments: AnyEventRecord[]): CommentNode[] {
  const byFilename = new Map(comments.map((comment) => [comment.filename, comment]));
  const nonMarkers = comments.filter((comment) => !isMarker(comment));
  const edited = new Set<string>();
  const removedChainRoots = new Set<string>();
  const resolvedChainRoots = new Set<string>();

  function chainRoot(filename: string): string {
    const seen = new Set<string>();
    let current = filename;
    for (let i = 0; i < 64; i++) {
      if (seen.has(current)) return current;
      seen.add(current);
      const event = byFilename.get(current);
      if (event === undefined || isMarker(event)) return current;
      const supersedes = supersedesOf(event);
      if (supersedes === undefined) return current;
      current = supersedes;
    }
    return current;
  }

  for (const comment of nonMarkers) {
    const supersedes = supersedesOf(comment);
    if (supersedes !== undefined) edited.add(supersedes);
  }
  for (const marker of comments) {
    const supersedes = supersedesOf(marker);
    if (supersedes === undefined) continue;
    if (isRemovedMarker(marker)) removedChainRoots.add(chainRoot(supersedes));
    if (isResolvedMarker(marker)) resolvedChainRoots.add(chainRoot(supersedes));
  }

  const current = nonMarkers.filter((comment) => {
    if (edited.has(comment.filename)) return false;
    return !removedChainRoots.has(chainRoot(comment.filename));
  });

  const roots = current.filter((comment) => inReplyToOf(comment) === undefined);
  const replies = current.filter((comment) => inReplyToOf(comment) !== undefined);

  return roots
    .map((root) => {
      const rootChain = chainRoot(root.filename);
      const rootReplies = replies
        .filter((reply) => {
          const inReplyTo = inReplyToOf(reply);
          return inReplyTo !== undefined && chainRoot(inReplyTo) === rootChain;
        })
        .sort(compareEvents);
      return {
        event: root,
        replies: rootReplies,
        resolved: resolvedChainRoots.has(rootChain),
      };
    })
    .sort((a, b) => compareEvents(a.event, b.event));
}

function compareEvents(a: AnyEventRecord, b: AnyEventRecord): number {
  const byTime = a.timestamp.localeCompare(b.timestamp);
  return byTime !== 0 ? byTime : a.filename.localeCompare(b.filename);
}

function estimatedHeight(group: CommentGroup, active: boolean): number {
  if (!active) return PASSIVE_HEIGHT;
  const messages = group.roots.reduce(
    (sum, root) => sum + 1 + root.replies.length,
    0,
  );
  return Math.min(520, 142 + messages * 82 + group.roots.length * 44);
}

export function RightComments(): JSX.Element {
  const events = useStore((s) => s.events);
  const participants = useStore((s) => s.participants);
  const commentTarget = useStore((s) => s.commentTarget);
  const setCommentTarget = useStore((s) => s.setCommentTarget);
  const setRightTab = useStore((s) => s.setRightTab);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const currentUserId = useStore((s) => s.currentUserId);
  const token = useStore((s) => s.token);
  const upsertEvent = useStore((s) => s.upsertEvent);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<LayoutState>({
    positions: {},
    height: 240,
  });
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const groups = useMemo(() => buildCommentGroups(events), [events]);
  const activeKey =
    commentTarget === null
      ? null
      : targetKey(commentTarget.file, commentTarget.lines);

  const currentWho =
    currentUserId !== null
      ? whoOf(currentUserId, participants)
      : { name: "You", initial: "Y", isUser: true };

  function scrollFocusedGroup(group: CommentGroup): void {
    const panel = panelRef.current?.closest<HTMLElement>(".panel-scroll");
    const card = panelRef.current?.querySelector<HTMLElement>(
      `[data-thread-key="${cssEscape(group.key)}"]`,
    );
    if (panel === null || panel === undefined || card === null || card === undefined) {
      return;
    }
    const targetTop =
      card.offsetTop -
      Math.max(0, (panel.clientHeight - card.offsetHeight) / 2);
    scrollToTop(panel, Math.max(0, targetTop));
    window.requestAnimationFrame(() => alignFeedAnchorToCard(group, card));
  }

  function computeLayout(): void {
    const panel = panelRef.current;
    if (panel === null) return;
    const panelRect = panel.getBoundingClientRect();
    const anchored = groups
      .map((group) => {
        const targetEl = findTargetElement(group.targetFile);
        const targetRect = targetEl?.getBoundingClientRect();
        const lineOffset =
          group.lines === undefined ? 0 : (group.lines[0] - 1) * LINE_HEIGHT;
        const top =
          targetRect === undefined
            ? 0
            : targetRect.top - panelRect.top + lineOffset;
        const card = panel.querySelector<HTMLElement>(
          `[data-thread-key="${cssEscape(group.key)}"]`,
        );
        const measuredHeight = card?.getBoundingClientRect().height ?? 0;
        return {
          group,
          top: Math.max(0, top),
          height:
            measuredHeight > 0
              ? measuredHeight
              : estimatedHeight(group, group.key === activeKey),
        };
      })
      .sort((a, b) => a.top - b.top);

    const positions: Record<string, number> = {};
    let cursor = 0;
    for (const item of anchored) {
      const nextTop = Math.max(item.top, cursor);
      positions[item.group.key] = nextTop;
      cursor = nextTop + item.height + CARD_GAP;
    }

    const height = anchored.reduce((max, item) => {
      const top = positions[item.group.key] ?? item.top;
      return Math.max(max, top + item.height + CARD_GAP);
    }, 240);
    setLayout({ positions, height });
  }

  useEffect(() => {
    let raf = window.requestAnimationFrame(computeLayout);
    const schedule = (): void => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(computeLayout);
    };
    const feed = document.querySelector<HTMLElement>(".feed-scroll");
    feed?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(raf);
      feed?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [groups, activeKey]);

  useEffect(() => {
    if (activeKey === null) return;
    const group = groups.find((item) => item.key === activeKey);
    if (group === undefined) return;
    scrollFocusedGroup(group);
  }, [activeKey, groups]);

  async function refreshEvents(): Promise<void> {
    if (currentSessionId === null) return;
    const client = createClient({ baseUrl: "", token });
    const fresh = await client.listEvents(currentSessionId, {});
    for (const event of fresh) upsertEvent(event);
  }

  async function postComment(
    key: string,
    group: CommentGroup,
    body: Omit<PostProseBody, "participant_id" | "append_to" | "mode" | "lines">,
  ): Promise<void> {
    if (currentSessionId === null || currentUserId === null) return;
    setBusyKey(key);
    try {
      const client = createClient({ baseUrl: "", token });
      await client.postProse(currentSessionId, {
        participant_id: currentUserId,
        append_to: group.targetFile,
        mode: "comment",
        ...(group.lines === undefined ? {} : { lines: group.lines }),
        ...body,
      });
      await refreshEvents();
    } finally {
      setBusyKey(null);
    }
  }

  function focusGroup(group: CommentGroup): void {
    setCommentTarget(
      group.lines === undefined
        ? { file: group.targetFile }
        : { file: group.targetFile, lines: group.lines },
    );
    setRightTab("comments");
    window.requestAnimationFrame(() => scrollFocusedGroup(group));
  }

  async function submitReply(group: CommentGroup, root: AnyEventRecord): Promise<void> {
    const key = root.filename;
    const text = replyDrafts[key]?.trim() ?? "";
    if (text.length === 0) return;
    setReplyDrafts((prev) => ({ ...prev, [key]: "" }));
    await postComment(`reply:${key}`, group, {
      content: text,
      in_reply_to: root.filename,
    });
  }

  async function addEmoji(
    group: CommentGroup,
    root: AnyEventRecord,
    emoji: string,
  ): Promise<void> {
    await postComment(`emoji:${root.filename}:${emoji}`, group, {
      content: emoji,
      in_reply_to: root.filename,
    });
  }

  async function saveEdit(group: CommentGroup, event: AnyEventRecord): Promise<void> {
    const text = editing[event.filename]?.trim() ?? "";
    if (text.length === 0) return;
    const inReplyTo = inReplyToOf(event);
    await postComment(`edit:${event.filename}`, group, {
      content: text,
      supersedes: event.filename,
      ...(inReplyTo === undefined ? {} : { in_reply_to: inReplyTo }),
    });
    setEditing((prev) => {
      const next = { ...prev };
      delete next[event.filename];
      return next;
    });
  }

  async function removeComment(group: CommentGroup, event: AnyEventRecord): Promise<void> {
    await postComment(`remove:${event.filename}`, group, {
      content: "_removed_",
      supersedes: event.filename,
    });
  }

  async function resolveComment(group: CommentGroup, event: AnyEventRecord): Promise<void> {
    await postComment(`resolve:${event.filename}`, group, {
      content: "_resolved_",
      supersedes: event.filename,
    });
  }

  function onReplyKey(
    e: KeyboardEvent<HTMLInputElement>,
    group: CommentGroup,
    root: AnyEventRecord,
  ): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitReply(group, root);
    }
  }

  if (groups.length === 0) {
    return <p className="right-comments-empty">No comment threads in this session.</p>;
  }

  return (
    <div
      ref={panelRef}
      className="right-comments tethered"
      style={{ minHeight: layout.height }}
    >
      {groups.map((group) => {
        const isActive = group.key === activeKey;
        return (
          <ThreadCard
            key={group.key}
            group={group}
            participants={participants}
            currentWho={currentWho}
            active={isActive}
            style={{ top: layout.positions[group.key] ?? 0 }}
            replyDrafts={replyDrafts}
            editing={editing}
            busyKey={busyKey}
            onFocus={() => focusGroup(group)}
            onReplyDraft={(root, value) =>
              setReplyDrafts((prev) => ({ ...prev, [root.filename]: value }))
            }
            onReplyKey={onReplyKey}
            onSubmitReply={submitReply}
            onEmoji={addEmoji}
            onStartEdit={(event) =>
              setEditing((prev) => ({
                ...prev,
                [event.filename]: contentOf(event),
              }))
            }
            onEditDraft={(event, value) =>
              setEditing((prev) => ({ ...prev, [event.filename]: value }))
            }
            onCancelEdit={(event) =>
              setEditing((prev) => {
                const next = { ...prev };
                delete next[event.filename];
                return next;
              })
            }
            onSaveEdit={saveEdit}
            onRemove={removeComment}
            onResolve={resolveComment}
          />
        );
      })}
    </div>
  );
}

interface ThreadCardProps {
  group: CommentGroup;
  participants: Record<string, Participant>;
  currentWho: ReturnType<typeof whoOf>;
  active: boolean;
  style: CSSProperties;
  replyDrafts: Record<string, string>;
  editing: Record<string, string>;
  busyKey: string | null;
  onFocus(): void;
  onReplyDraft(root: AnyEventRecord, value: string): void;
  onReplyKey(
    e: KeyboardEvent<HTMLInputElement>,
    group: CommentGroup,
    root: AnyEventRecord,
  ): void;
  onSubmitReply(group: CommentGroup, root: AnyEventRecord): Promise<void>;
  onEmoji(group: CommentGroup, root: AnyEventRecord, emoji: string): Promise<void>;
  onStartEdit(event: AnyEventRecord): void;
  onEditDraft(event: AnyEventRecord, value: string): void;
  onCancelEdit(event: AnyEventRecord): void;
  onSaveEdit(group: CommentGroup, event: AnyEventRecord): Promise<void>;
  onRemove(group: CommentGroup, event: AnyEventRecord): Promise<void>;
  onResolve(group: CommentGroup, event: AnyEventRecord): Promise<void>;
}

function ThreadCard({
  group,
  participants,
  currentWho,
  active,
  style,
  replyDrafts,
  editing,
  busyKey,
  onFocus,
  onReplyDraft,
  onReplyKey,
  onSubmitReply,
  onEmoji,
  onStartEdit,
  onEditDraft,
  onCancelEdit,
  onSaveEdit,
  onRemove,
  onResolve,
}: ThreadCardProps): JSX.Element {
  const messageCount = group.roots.reduce(
    (sum, root) => sum + 1 + root.replies.length,
    0,
  );
  const first = group.roots[0]?.event;
  const firstWho =
    first === undefined
      ? null
      : whoOf(first.participant_id, participants);

  return (
    <article
      className={["right-comments-thread", active ? "active" : "passive"]
        .join(" ")
        .trim()}
      style={style}
      data-thread-key={group.key}
      onClick={onFocus}
    >
      <div className="right-comments-thread-head">
        <MessageSquare size={14} aria-hidden />
        <div>
          <b title={group.title}>{group.title}</b>
          <span>
            {lineLabel(group.lines)} · {messageCount}{" "}
            {messageCount === 1 ? "comment" : "comments"}
          </span>
        </div>
      </div>
      {group.quote !== null && <blockquote className="right-comments-quote">{group.quote}</blockquote>}
      {!active && first !== undefined && firstWho !== null && (
        <div className="right-comment-preview">
          <span
            className={["avatar", firstWho.isUser ? "user" : "agent", "sm"].join(" ")}
            aria-hidden
          >
            {firstWho.initial}
          </span>
          <p>
            <b>{firstWho.name}</b> {shortPreview(contentOf(first), 96)}
          </p>
        </div>
      )}
      {active && (
        <div className="right-comment-expanded">
          {group.roots.map((root) => (
            <CommentRoot
              key={root.event.filename}
              group={group}
              root={root}
              participants={participants}
              currentWho={currentWho}
              replyDraft={replyDrafts[root.event.filename] ?? ""}
              editing={editing}
              busyKey={busyKey}
              onReplyDraft={onReplyDraft}
              onReplyKey={onReplyKey}
              onSubmitReply={onSubmitReply}
              onEmoji={onEmoji}
              onStartEdit={onStartEdit}
              onEditDraft={onEditDraft}
              onCancelEdit={onCancelEdit}
              onSaveEdit={onSaveEdit}
              onRemove={onRemove}
              onResolve={onResolve}
            />
          ))}
        </div>
      )}
    </article>
  );
}

interface CommentRootProps {
  group: CommentGroup;
  root: CommentNode;
  participants: Record<string, Participant>;
  currentWho: ReturnType<typeof whoOf>;
  replyDraft: string;
  editing: Record<string, string>;
  busyKey: string | null;
  onReplyDraft(root: AnyEventRecord, value: string): void;
  onReplyKey(
    e: KeyboardEvent<HTMLInputElement>,
    group: CommentGroup,
    root: AnyEventRecord,
  ): void;
  onSubmitReply(group: CommentGroup, root: AnyEventRecord): Promise<void>;
  onEmoji(group: CommentGroup, root: AnyEventRecord, emoji: string): Promise<void>;
  onStartEdit(event: AnyEventRecord): void;
  onEditDraft(event: AnyEventRecord, value: string): void;
  onCancelEdit(event: AnyEventRecord): void;
  onSaveEdit(group: CommentGroup, event: AnyEventRecord): Promise<void>;
  onRemove(group: CommentGroup, event: AnyEventRecord): Promise<void>;
  onResolve(group: CommentGroup, event: AnyEventRecord): Promise<void>;
}

function CommentRoot({
  group,
  root,
  participants,
  currentWho,
  replyDraft,
  editing,
  busyKey,
  onReplyDraft,
  onReplyKey,
  onSubmitReply,
  onEmoji,
  onStartEdit,
  onEditDraft,
  onCancelEdit,
  onSaveEdit,
  onRemove,
  onResolve,
}: CommentRootProps): JSX.Element {
  const rootBusy = busyKey?.endsWith(root.event.filename) === true;
  return (
    <section className={["right-comment-root", root.resolved ? "resolved" : ""].join(" ").trim()}>
      <CommentMessage
        group={group}
        event={root.event}
        participants={participants}
        reply={false}
        editing={editing}
        busyKey={busyKey}
        onStartEdit={onStartEdit}
        onEditDraft={onEditDraft}
        onCancelEdit={onCancelEdit}
        onSaveEdit={onSaveEdit}
        onRemove={onRemove}
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
          onStartEdit={onStartEdit}
          onEditDraft={onEditDraft}
          onCancelEdit={onCancelEdit}
          onSaveEdit={onSaveEdit}
          onRemove={onRemove}
        />
      ))}
      <div className="right-comment-tools" onClick={(e) => e.stopPropagation()}>
        <div className="right-comment-replybox">
          <span
            className={["avatar", currentWho.isUser ? "user" : "agent", "sm"].join(" ")}
            aria-hidden
          >
            {currentWho.initial}
          </span>
          <input
            type="text"
            value={replyDraft}
            placeholder="Reply…"
            aria-label={`Reply to ${whoOf(root.event.participant_id, participants).name}`}
            onChange={(e) => onReplyDraft(root.event, e.target.value)}
            onKeyDown={(e) => onReplyKey(e, group, root.event)}
          />
          <button
            type="button"
            className="right-comment-icon-btn"
            aria-label="Send reply"
            onClick={() => void onSubmitReply(group, root.event)}
            disabled={busyKey !== null || replyDraft.trim().length === 0}
          >
            <SendHorizontal size={13} aria-hidden />
          </button>
        </div>
        <div className="right-comment-secondary-actions">
          <div className="right-comment-emoji-row" aria-label="Add reaction">
            <SmilePlus size={13} aria-hidden />
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`React ${emoji}`}
                onClick={() => void onEmoji(group, root.event, emoji)}
                disabled={busyKey !== null}
              >
                {emoji}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={["right-comment-resolve", root.resolved ? "resolved" : ""]
              .join(" ")
              .trim()}
            disabled={root.resolved || busyKey !== null || rootBusy}
            onClick={() => void onResolve(group, root.event)}
          >
            <Check size={13} aria-hidden />
            {root.resolved ? "Resolved" : "Resolve"}
          </button>
        </div>
      </div>
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
  onStartEdit(event: AnyEventRecord): void;
  onEditDraft(event: AnyEventRecord, value: string): void;
  onCancelEdit(event: AnyEventRecord): void;
  onSaveEdit(group: CommentGroup, event: AnyEventRecord): Promise<void>;
  onRemove(group: CommentGroup, event: AnyEventRecord): Promise<void>;
}

function CommentMessage({
  group,
  event,
  participants,
  reply,
  editing,
  busyKey,
  onStartEdit,
  onEditDraft,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: CommentMessageProps): JSX.Element {
  const who = whoOf(event.participant_id, participants);
  const editText = editing[event.filename];
  const isEditing = editText !== undefined;

  return (
    <div className={["right-comment-msg", reply ? "reply" : ""].join(" ").trim()}>
      <span
        className={["avatar", who.isUser ? "user" : "agent", "sm"].join(" ")}
        aria-hidden
      >
        {who.initial}
      </span>
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
              onChange={(e) => onEditDraft(event, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  onCancelEdit(event);
                }
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void onSaveEdit(group, event);
                }
              }}
            />
            <div>
              <button
                type="button"
                className="right-comment-icon-btn"
                aria-label="Cancel edit"
                onClick={() => onCancelEdit(event)}
              >
                <X size={13} aria-hidden />
              </button>
              <button
                type="button"
                className="right-comment-icon-btn primary"
                aria-label="Save edit"
                disabled={busyKey !== null || editText.trim().length === 0}
                onClick={() => void onSaveEdit(group, event)}
              >
                <Check size={13} aria-hidden />
              </button>
            </div>
          </div>
        ) : (
          <>
            <p>{contentOf(event)}</p>
            <div className="right-comment-msg-actions">
              <button
                type="button"
                aria-label="Edit comment"
                onClick={() => onStartEdit(event)}
              >
                <Pencil size={12} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Remove comment"
                disabled={busyKey !== null}
                onClick={() => void onRemove(group, event)}
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
