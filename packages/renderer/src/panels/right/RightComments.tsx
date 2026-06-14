import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
} from "react";
import {
  AlignLeft,
  Bot,
  Check,
  List,
  MessageSquare,
  Pencil,
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
import { getCommentTarget, getFileCommentTarget } from "@f-mark/shared";
import { createClient, type PostProseBody } from "../../api/client.js";
import { createManagedAgentsClient } from "../../api/managedAgents.js";
import { formatWhen, whoOf } from "../../cards/format.js";
import { AgentMentionPicker } from "../../components/AgentMentionPicker.js";
import { LoadingAnimation } from "../../components/LoadingAnimation.js";
import { ParticipantAvatar } from "../../components/ParticipantAvatar.js";
import { useStore } from "../../state/store.js";
import { LogLevel, useSeqLog } from "../../hooks/useSeqLog.js";

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
  /** Set when this is a file/diff comment group (repo path target) rather than
   *  an event-anchored one. `targetFile` then holds the file path. */
  filePath?: string;
  hunk?: string;
  base?: string;
}

interface LayoutState {
  positions: Record<string, number>;
  height: number;
}

const EMOJIS = ["👍", "❤️", "👀", "✅"];
const PASSIVE_HEIGHT = 82;
const LINE_HEIGHT = 25;
const CARD_GAP = 12;
/* Top buffer (px) reserved above natural-top-zero in anchored mode so a
   thread whose anchor scrolled above the feed viewport can also scroll
   above the panel viewport. Without this, top is clamped to 0 and the
   thread "sticks" at the top of the panel while its anchor disappears
   upward in the feed. The buffer is paired with an initial panel.scrollTop
   set to BUFFER so visually the first paint matches the old behavior. */
const TOP_BUFFER = 800;

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
  const candidate = findFeedEventElement(filename);
  if (candidate === null) return null;
  const content = candidate.querySelector<HTMLElement>(".commentable-content");
  return content ?? candidate;
}

function findFeedEventElement(filename: string): HTMLElement | null {
  const selector = `[data-event-filename="${cssEscape(filename)}"]`;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return candidates[0] ?? null;
}

function feedAnchorTop(group: CommentGroup): number | null {
  const eventEl = findFeedEventElement(group.targetFile);
  if (eventEl === null) return null;
  if (group.lines !== undefined) {
    const marker = eventEl.querySelector<HTMLElement>(
      `[data-target-lines="${cssEscape(lineKey(group.lines))}"]`,
    );
    if (marker !== null) return marker.getBoundingClientRect().top;
  }
  const targetEl = findTargetElement(group.targetFile);
  if (targetEl === null) return eventEl.getBoundingClientRect().top;
  const fallbackOffset =
    group.lines === undefined ? 0 : (group.lines[0] - 1) * LINE_HEIGHT;
  return targetEl.getBoundingClientRect().top + fallbackOffset;
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
  const anchorTop = feedAnchorTop(group);
  if (feed === null || anchorTop === null) return;
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

  /* File/diff comment groups — keyed on repo path (+ hunk/lines). No event
     anchor, so `target` stays undefined and the title is the file basename. */
  const fileBuckets = new Map<
    string,
    {
      filePath: string;
      lines?: LineRange;
      hunk?: string;
      base?: string;
      comments: AnyEventRecord[];
    }
  >();
  for (const event of events) {
    if (event.kind !== "prose") continue;
    const ft = getFileCommentTarget(event.payload as ProsePayload);
    if (ft === undefined) continue;
    const fkey =
      ft.hunk !== undefined
        ? `${ft.file_path}::${ft.base ?? "working"}::${ft.hunk}`
        : `${ft.file_path}::${ft.lines ? `${ft.lines[0]}:${ft.lines[1]}` : "all"}`;
    const existing = fileBuckets.get(fkey);
    if (existing === undefined) {
      fileBuckets.set(fkey, {
        filePath: ft.file_path,
        ...(ft.lines === undefined ? {} : { lines: ft.lines }),
        ...(ft.hunk === undefined ? {} : { hunk: ft.hunk }),
        ...(ft.base === undefined ? {} : { base: ft.base }),
        comments: [event],
      });
    } else {
      existing.comments.push(event);
    }
  }
  for (const [fkey, bucket] of fileBuckets) {
    const roots = buildThreads(bucket.comments);
    if (roots.length === 0) continue;
    const base = bucket.filePath.split("/").pop() ?? bucket.filePath;
    groups.push({
      key: fkey,
      targetFile: bucket.filePath,
      filePath: bucket.filePath,
      ...(bucket.lines === undefined ? {} : { lines: bucket.lines }),
      ...(bucket.hunk === undefined ? {} : { hunk: bucket.hunk }),
      ...(bucket.base === undefined ? {} : { base: bucket.base }),
      title: base,
      quote: bucket.hunk ?? null,
      roots,
      anchorOrder: `~file:${fkey}`,
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
  const focusedCommentId = useStore((s) => s.focusedCommentId);
  const setFocusedCommentId = useStore((s) => s.setFocusedCommentId);
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
  const [replyMentions, setReplyMentions] = useState<Record<string, ProseMention[]>>({});
  const [mentionTarget, setMentionTarget] = useState<{
    rootFilename: string;
    rect: DOMRect;
  } | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  /* Anchored mode is the default — thread cards align with their feed
     anchors and gaps between them stretch proportionally. List mode lays
     thread cards out flow-statically with a constant gap, decoupling them
     from feed scroll position. */
  const [layoutMode, setLayoutMode] = useState<"anchored" | "list">("anchored");
  const focusedScrollRafRef = useRef<number | null>(null);
  const replyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const groups = useMemo(() => buildCommentGroups(events), [events]);
  const activeKey =
    commentTarget === null
      ? null
      : commentTarget.kind === "event"
        ? targetKey(commentTarget.file, commentTarget.lines)
        : `${commentTarget.file_path}::${lineKey(commentTarget.lines)}`;
  const log = useSeqLog("RightComments");

  const currentWho =
    currentUserId !== null
      ? whoOf(currentUserId, participants)
      : { id: "us-local", name: "You", initial: "Y", isUser: true };

  const scrollFocusedGroup = useCallback((group: CommentGroup): void => {
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
  }, []);

  const cancelFocusedScroll = useCallback((): void => {
    if (focusedScrollRafRef.current !== null) {
      window.cancelAnimationFrame(focusedScrollRafRef.current);
      focusedScrollRafRef.current = null;
    }
  }, []);

  const scheduleFocusedGroupScroll = useCallback(
    (group: CommentGroup): void => {
      cancelFocusedScroll();
      focusedScrollRafRef.current = window.requestAnimationFrame(() => {
        focusedScrollRafRef.current = window.requestAnimationFrame(() => {
          focusedScrollRafRef.current = null;
          scrollFocusedGroup(group);
        });
      });
    },
    [cancelFocusedScroll, scrollFocusedGroup],
  );

  const computeLayout = useCallback((): void => {
    const panel = panelRef.current;
    if (panel === null) return;
    const panelRect = panel.getBoundingClientRect();
    /* Natural top can be negative when the anchor has scrolled above the
       feed viewport. We add TOP_BUFFER inside the cursor loop so positions
       end up non-negative; the panel-scroll's initial scrollTop matches
       TOP_BUFFER so the buffered area becomes scrollable upward. */
    const anchored = groups
      .map((group) => {
        const anchorTop = feedAnchorTop(group);
        const top =
          anchorTop === null
            ? 0
            : anchorTop - panelRect.top;
        const card = panel.querySelector<HTMLElement>(
          `[data-thread-key="${cssEscape(group.key)}"]`,
        );
        const measuredHeight = card?.getBoundingClientRect().height ?? 0;
        return {
          group,
          top,
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
      const desired = item.top + TOP_BUFFER;
      const nextTop = Math.max(desired, cursor);
      positions[item.group.key] = nextTop;
      cursor = nextTop + item.height + CARD_GAP;
    }

    const height = anchored.reduce((max, item) => {
      const top = positions[item.group.key] ?? item.top + TOP_BUFFER;
      return Math.max(max, top + item.height + CARD_GAP);
    }, TOP_BUFFER + 240);
    setLayout({ positions, height });
  }, [activeKey, groups]);

  useLayoutEffect(() => {
    computeLayout();
  }, [computeLayout]);

  useEffect(() => {
    let raf: number | null = null;
    const schedule = (): void => {
      if (raf !== null) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(computeLayout);
    };
    const feed = document.querySelector<HTMLElement>(".feed-scroll");
    feed?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
      feed?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [computeLayout]);

  useEffect(() => cancelFocusedScroll, [cancelFocusedScroll]);

  /* First mount with anchored layout and threads visible: scroll the panel
     past the TOP_BUFFER so the user starts looking at thread positions
     (instead of the empty buffer area). Subsequent activeKey-driven scrolls
     handled by scheduleFocusedGroupScroll. */
  const initialScrollSetRef = useRef(false);
  useEffect(() => {
    if (layoutMode !== "anchored") return;
    if (initialScrollSetRef.current) return;
    if (groups.length === 0) return;
    const panel = panelRef.current?.closest<HTMLElement>(".panel-scroll");
    if (panel === null || panel === undefined) return;
    if (panel.scrollTop === 0) {
      panel.scrollTop = TOP_BUFFER;
    }
    initialScrollSetRef.current = true;
  }, [groups.length, layoutMode]);

  useEffect(() => {
    if (activeKey === null) return;
    const group = groups.find((item) => item.key === activeKey);
    if (group === undefined) return;
    scheduleFocusedGroupScroll(group);
  }, [activeKey, groups, scheduleFocusedGroupScroll]);

  useEffect(() => {
    if (focusedCommentId === null) return;
    if (activeKey === null) return;
    let cancelled = false;
    let timeout: number | null = null;
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        const node = panelRef.current?.querySelector<HTMLElement>(
          `[data-comment-event-id="${cssEscape(focusedCommentId)}"]`,
        );
        if (node === null || node === undefined) return;
        node.scrollIntoView({ block: "center", behavior: "smooth" });
        node.classList.add("comment-focus-pulse");
        timeout = window.setTimeout(() => {
          node.classList.remove("comment-focus-pulse");
        }, 900);
        setFocusedCommentId(null);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [activeKey, focusedCommentId, setFocusedCommentId]);

  /* Dismiss focus on Escape or on mousedown outside the comment-related UI.
     "Comment-related UI" is: any thread card in the right panel, a line
     comment marker/anchor/highlight/popover in the feed, or the
     close-thread button. Clicks on plain feed content (other cards, empty
     space) clear the focus so the user can move on without hunting for the
     close button. Inputs/textareas/contenteditable skip Escape so the key
     still cancels in-progress edits. */
  useEffect(() => {
    if (commentTarget === null) return;
    function isInsideCommentUi(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false;
      // Clicks anywhere inside the right panel (thread cards, mode toggle,
      // tab row) keep the comment focus alive — the user is still working
      // with the comment UI. Clicks on in-feed comment affordances (line
      // markers, the active-range highlight, an open draft popover) also
      // count, since they either set a new focus or interact with the
      // existing one.
      return (
        target.closest(".right-panel") !== null ||
        target.closest(".line-comment-anchor") !== null ||
        target.closest(".line-comment-highlight") !== null ||
        target.closest(".line-comment-popover") !== null
      );
    }
    function onKey(e: globalThis.KeyboardEvent): void {
      if (e.key !== "Escape") return;
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      setCommentTarget(null);
    }
    function onMouseDown(e: globalThis.MouseEvent): void {
      if (isInsideCommentUi(e.target)) return;
      setCommentTarget(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [commentTarget, setCommentTarget]);

  async function refreshEvents(): Promise<void> {
    if (currentSessionId === null) return;
    const client = createClient({ baseUrl: "", token });
    const fresh = await client.listEvents(currentSessionId, {});
    for (const event of fresh) upsertEvent(event);
  }

  function wakeTargetsForComment(
    group: CommentGroup,
    mentions: ProseMention[] | undefined,
  ): string[] {
    const ids = new Set<string>();
    for (const mention of mentions ?? []) ids.add(mention.participant_id);
    const targetParticipantId = group.target?.participant_id;
    if (
      targetParticipantId !== undefined &&
      participants[targetParticipantId]?.kind === "agent"
    ) {
      ids.add(targetParticipantId);
    }
    return [...ids];
  }

  async function postComment(
    key: string,
    group: CommentGroup,
    body: Omit<PostProseBody, "participant_id" | "append_to" | "mode" | "lines">,
  ): Promise<void> {
    if (currentSessionId === null || currentUserId === null) {
      log(
        "RightComments postComment skipped — no session or user",
        {
          key,
          hasSession: currentSessionId !== null,
          hasUser: currentUserId !== null,
        },
        LogLevel.Warning,
      );
      return;
    }
    setBusyKey(key);
    try {
      const client = createClient({ baseUrl: "", token });
      const managedClient = createManagedAgentsClient({ baseUrl: "", token });
      const response = await client.postProse(currentSessionId, {
        participant_id: currentUserId,
        ...(group.filePath !== undefined
          ? {
              file_path: group.filePath,
              ...(group.lines === undefined ? {} : { lines: group.lines }),
              ...(group.hunk === undefined ? {} : { diff_hunk: group.hunk }),
              ...(group.base === undefined ? {} : { diff_base: group.base }),
            }
          : {
              append_to: group.targetFile,
              mode: "comment" as const,
              ...(group.lines === undefined ? {} : { lines: group.lines }),
            }),
        ...body,
      });
      const targetIds = wakeTargetsForComment(group, body.mentions);
      if (targetIds.length > 0) {
        await managedClient.wakeSession(currentSessionId, {
          reason: "comment",
          source_event: response.filename,
          target_participant_ids: targetIds,
        });
      }
      await refreshEvents();
      log(
        "RightComments postComment ok",
        { key, filename: response.filename },
        LogLevel.Info,
      );
    } catch (err) {
      log(
        "RightComments postComment failed",
        {
          key,
          appendTo: group.targetFile,
          error: err instanceof Error ? err.message : String(err),
        },
        LogLevel.Error,
      );
      throw err;
    } finally {
      setBusyKey(null);
    }
  }

  function focusGroup(group: CommentGroup): void {
    const targetEl = findTargetElement(group.targetFile);
    log(
      "RightComments thread focused",
      {
        targetFile: group.targetFile,
        lines: group.lines ?? null,
        groupKey: group.key,
        rootCount: group.roots.length,
        targetElementFound: targetEl !== null,
        $note:
          "Click on a comment thread should focus the group and scroll the feed to the anchor",
      },
      targetEl === null ? LogLevel.Warning : LogLevel.Info,
    );
    setCommentTarget(
      group.filePath !== undefined
        ? {
            kind: "file",
            file_path: group.filePath,
            ...(group.lines === undefined ? {} : { lines: group.lines }),
          }
        : group.lines === undefined
          ? { kind: "event", file: group.targetFile }
          : { kind: "event", file: group.targetFile, lines: group.lines },
    );
    setRightTab("comments");
    scheduleFocusedGroupScroll(group);
  }

  function setReplyInputRef(root: AnyEventRecord, node: HTMLInputElement | null): void {
    replyInputRefs.current[root.filename] = node;
  }

  function openReplyMentions(root: AnyEventRecord, rect: DOMRect): void {
    setMentionTarget({ rootFilename: root.filename, rect });
  }

  function closeReplyMentions(): void {
    setMentionTarget(null);
  }

  function addReplyMention(rootFilename: string, mention: ProseMention): void {
    const existing = replyMentions[rootFilename] ?? [];
    if (existing.some((item) => item.participant_id === mention.participant_id)) {
      setMentionTarget(null);
      queueMicrotask(() => replyInputRefs.current[rootFilename]?.focus());
      return;
    }
    setReplyMentions((prev) => ({
      ...prev,
      [rootFilename]: [...(prev[rootFilename] ?? []), mention],
    }));
    setReplyDrafts((prev) => {
      const value = prev[rootFilename] ?? "";
      const needsSpace = value.length > 0 && !/\s$/.test(value);
      return {
        ...prev,
        [rootFilename]: `${value}${needsSpace ? " " : ""}${mention.token} `,
      };
    });
    setMentionTarget(null);
    queueMicrotask(() => replyInputRefs.current[rootFilename]?.focus());
  }

  async function submitReply(group: CommentGroup, root: AnyEventRecord): Promise<void> {
    const key = root.filename;
    const text = replyDrafts[key]?.trim() ?? "";
    if (text.length === 0) return;
    const mentions = replyMentions[key] ?? [];
    setReplyDrafts((prev) => ({ ...prev, [key]: "" }));
    setReplyMentions((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    await postComment(`reply:${key}`, group, {
      content: text,
      in_reply_to: root.filename,
      ...(mentions.length > 0 ? { mentions } : {}),
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
    return <LoadingAnimation className="panel-loading" />;
  }

  const isAnchored = layoutMode === "anchored";

  return (
    <div className="right-comments-wrap">
      <div className="right-comments-mode-toggle" role="group" aria-label="Thread layout mode">
        <button
          type="button"
          className={isAnchored ? "on" : ""}
          onClick={() => setLayoutMode("anchored")}
          aria-pressed={isAnchored}
          aria-label="Anchored to feed"
          title="Anchored — align with feed"
        >
          <AlignLeft size={12} aria-hidden />
        </button>
        <button
          type="button"
          className={!isAnchored ? "on" : ""}
          onClick={() => setLayoutMode("list")}
          aria-pressed={!isAnchored}
          aria-label="List"
          title="List — uniform gaps"
        >
          <List size={12} aria-hidden />
        </button>
      </div>
      <div
        ref={panelRef}
        className={`right-comments ${isAnchored ? "tethered" : "list"}`}
        style={isAnchored ? { minHeight: layout.height } : undefined}
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
            style={isAnchored ? { top: layout.positions[group.key] ?? 0 } : undefined}
            replyDrafts={replyDrafts}
            replyMentions={replyMentions}
            editing={editing}
            busyKey={busyKey}
            onFocus={() => focusGroup(group)}
            onClose={() => setCommentTarget(null)}
            onReplyInputRef={setReplyInputRef}
            onReplyDraft={(root, value) =>
              setReplyDrafts((prev) => ({ ...prev, [root.filename]: value }))
            }
            onReplyKey={onReplyKey}
            onOpenMentions={openReplyMentions}
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
      {mentionTarget !== null ? (
        <AgentMentionPicker
          anchorRect={mentionTarget.rect}
          sessionId={currentSessionId}
          token={token}
          participants={participants}
          selectedIds={
            new Set(
              (replyMentions[mentionTarget.rootFilename] ?? []).map(
                (mention) => mention.participant_id,
              ),
            )
          }
          onSelect={(mention) =>
            addReplyMention(mentionTarget.rootFilename, mention)
          }
          onClose={closeReplyMentions}
        />
      ) : null}
      </div>
    </div>
  );
}

interface ThreadCardProps {
  group: CommentGroup;
  participants: Record<string, Participant>;
  currentWho: ReturnType<typeof whoOf>;
  active: boolean;
  style: CSSProperties | undefined;
  replyDrafts: Record<string, string>;
  replyMentions: Record<string, ProseMention[]>;
  editing: Record<string, string>;
  busyKey: string | null;
  onFocus(): void;
  onClose(): void;
  onReplyInputRef(root: AnyEventRecord, node: HTMLInputElement | null): void;
  onReplyDraft(root: AnyEventRecord, value: string): void;
  onReplyKey(
    e: KeyboardEvent<HTMLInputElement>,
    group: CommentGroup,
    root: AnyEventRecord,
  ): void;
  onOpenMentions(root: AnyEventRecord, rect: DOMRect): void;
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
  replyMentions,
  editing,
  busyKey,
  onFocus,
  onClose,
  onReplyInputRef,
  onReplyDraft,
  onReplyKey,
  onOpenMentions,
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
        {active && (
          <button
            type="button"
            className="right-comments-thread-close"
            aria-label="Close comment focus"
            title="Close (Esc)"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <XCircle size={14} aria-hidden />
          </button>
        )}
      </div>
      {group.quote !== null && <blockquote className="right-comments-quote">{group.quote}</blockquote>}
      {!active && first !== undefined && firstWho !== null && (
        <div className="right-comment-preview">
          <ParticipantAvatar
            participantId={firstWho.id}
            kind={firstWho.isUser ? "user" : "agent"}
            name={firstWho.name}
            color={firstWho.color}
            runtimeId={firstWho.runtimeId}
            size="sm"
          />
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
              replyMentions={replyMentions[root.event.filename] ?? []}
              editing={editing}
              busyKey={busyKey}
              onReplyInputRef={onReplyInputRef}
              onReplyDraft={onReplyDraft}
              onReplyKey={onReplyKey}
              onOpenMentions={onOpenMentions}
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
  replyMentions: ProseMention[];
  editing: Record<string, string>;
  busyKey: string | null;
  onReplyInputRef(root: AnyEventRecord, node: HTMLInputElement | null): void;
  onReplyDraft(root: AnyEventRecord, value: string): void;
  onReplyKey(
    e: KeyboardEvent<HTMLInputElement>,
    group: CommentGroup,
    root: AnyEventRecord,
  ): void;
  onOpenMentions(root: AnyEventRecord, rect: DOMRect): void;
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
  replyMentions,
  editing,
  busyKey,
  onReplyInputRef,
  onReplyDraft,
  onReplyKey,
  onOpenMentions,
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
          <ParticipantAvatar
            participantId={currentWho.id}
            kind={currentWho.isUser ? "user" : "agent"}
            name={currentWho.name}
            color={currentWho.color}
            runtimeId={currentWho.runtimeId}
            size="sm"
          />
          <input
            ref={(node) => onReplyInputRef(root.event, node)}
            type="text"
            value={replyDraft}
            placeholder="Reply…"
            aria-label={`Reply to ${whoOf(root.event.participant_id, participants).name}`}
            onChange={(e) => {
              onReplyDraft(root.event, e.target.value);
              if (e.target.value.endsWith("@")) {
                onOpenMentions(root.event, e.currentTarget.getBoundingClientRect());
              }
            }}
            onKeyDown={(e) => onReplyKey(e, group, root.event)}
          />
          <button
            type="button"
            className={[
              "right-comment-icon-btn",
              replyMentions.length > 0 ? "active" : "",
            ]
              .join(" ")
              .trim()}
            aria-label="Mention agent"
            title="Mention agent"
            onClick={(e) =>
              onOpenMentions(root.event, e.currentTarget.getBoundingClientRect())
            }
            disabled={busyKey !== null}
          >
            <Bot size={13} aria-hidden />
          </button>
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
    <div
      className={["right-comment-msg", reply ? "reply" : ""].join(" ").trim()}
      data-comment-event-id={event.filename}
    >
      <ParticipantAvatar
        participantId={who.id}
        kind={who.isUser ? "user" : "agent"}
        name={who.name}
        color={who.color}
        runtimeId={who.runtimeId}
        size="sm"
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
