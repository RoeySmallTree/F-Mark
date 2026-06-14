import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type MouseEvent,
} from "react";
import { Bot, MessageSquare, SendHorizontal, Trash2, X } from "lucide-react";
import type {
  AnyEventRecord,
  Participant,
  ProseMention,
  ProsePayload,
} from "@f-mark/shared";
import { getCommentTarget } from "@f-mark/shared";
import { createClient } from "../api/client.js";
import { createManagedAgentsClient } from "../api/managedAgents.js";
import { MarkdownRenderer, type MarkdownMode } from "../render/MarkdownRenderer.js";
import { useStore, type CommentTarget } from "../state/store.js";
import { whoOf } from "./format.js";
import { AgentMentionPicker } from "../components/AgentMentionPicker.js";
import { ParticipantAvatar } from "../components/ParticipantAvatar.js";

type LineRange = [number, number];

interface Props {
  event: AnyEventRecord;
  content: string;
  comments: AnyEventRecord[];
  participants: Record<string, Participant>;
  mode?: MarkdownMode;
  className?: string;
  lineHeight?: number;
}

interface AnchorGroup {
  key: string;
  lines: LineRange;
  comments: AnyEventRecord[];
  color: string;
  resolved: boolean;
}

interface MarkerLayout<T> {
  item: T;
  visualCenter: number;
  box: LineBox;
}

interface LineBox {
  line: number;
  top: number;
  bottom: number;
  center: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeLines(
  lines: LineRange | undefined,
  maxLine: number,
): LineRange {
  const start = clamp(lines?.[0] ?? 1, 1, maxLine);
  const end = clamp(lines?.[1] ?? start, start, maxLine);
  return [start, end];
}

function lineKey(lines: LineRange): string {
  return `${lines[0]}:${lines[1]}`;
}

function linesFromKey(key: string): LineRange | null {
  const parts = key.split(":");
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

function lineLabel(lines: LineRange): string {
  return lines[0] === lines[1]
    ? `line ${lines[0]}`
    : `lines ${lines[0]}-${lines[1]}`;
}

function rangeEquals(a: LineRange, b: LineRange): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function sameLineBoxes(a: LineBox[], b: LineBox[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((box, idx) => {
    const other = b[idx];
    return (
      other !== undefined &&
      box.line === other.line &&
      Math.abs(box.top - other.top) < 0.5 &&
      Math.abs(box.bottom - other.bottom) < 0.5
    );
  });
}

function fallbackLineBoxes(lineCount: number, lineHeight: number): LineBox[] {
  return Array.from({ length: lineCount }, (_, idx) => {
    const line = idx + 1;
    const top = idx * lineHeight;
    const bottom = top + lineHeight;
    return { line, top, bottom, center: top + lineHeight / 2 };
  });
}

function rectsOf(range: Range): DOMRect[] {
  if (typeof range.getClientRects !== "function") return [];
  return Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
}

function overlaps(
  a: { top: number; bottom: number },
  b: { top: number; bottom: number },
): boolean {
  return Math.max(a.top, b.top) <= Math.min(a.bottom, b.bottom);
}

function renderedRows(root: HTMLElement): { top: number; bottom: number }[] {
  const rootRect = root.getBoundingClientRect();
  const rows: { top: number; bottom: number }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (parent?.closest(".line-comment-highlight") !== null) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent?.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let node = walker.nextNode();
  while (node !== null) {
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of rectsOf(range)) {
      const top = rect.top - rootRect.top;
      const bottom = rect.bottom - rootRect.top;
      const existing = rows.find(
        (row) => Math.abs(row.top - top) < 2 || overlaps(row, { top, bottom }),
      );
      if (existing === undefined) {
        rows.push({ top, bottom });
      } else {
        existing.top = Math.min(existing.top, top);
        existing.bottom = Math.max(existing.bottom, bottom);
      }
    }
    range.detach?.();
    node = walker.nextNode();
  }
  return rows.sort((a, b) => a.top - b.top);
}

function measureLineBoxes(
  root: HTMLElement | null,
  lineCount: number,
  lineHeight: number,
): LineBox[] {
  if (root === null) return fallbackLineBoxes(lineCount, lineHeight);
  const rows = renderedRows(root);
  if (rows.length === 0) return fallbackLineBoxes(lineCount, lineHeight);

  const byLine = new Map<number, { top: number; bottom: number }>();
  rows.forEach((row, idx) => {
    const line = clamp(Math.floor((idx * lineCount) / rows.length) + 1, 1, lineCount);
    const existing = byLine.get(line);
    if (existing === undefined) {
      byLine.set(line, { top: row.top, bottom: row.bottom });
    } else {
      existing.top = Math.min(existing.top, row.top);
      existing.bottom = Math.max(existing.bottom, row.bottom);
    }
  });

  return fallbackLineBoxes(lineCount, lineHeight).map((box) => {
    const measured = byLine.get(box.line);
    if (measured === undefined) return box;
    return {
      line: box.line,
      top: measured.top,
      bottom: measured.bottom,
      center: (measured.top + measured.bottom) / 2,
    };
  });
}

function boxForRange(
  lines: LineRange,
  boxes: LineBox[],
  lineHeight: number,
): LineBox {
  const selected = boxes.filter(
    (box) => box.line >= lines[0] && box.line <= lines[1],
  );
  if (selected.length === 0) {
    const top = (lines[0] - 1) * lineHeight;
    const bottom = lines[1] * lineHeight;
    return { line: lines[0], top, bottom, center: (top + bottom) / 2 };
  }
  const top = Math.min(...selected.map((box) => box.top));
  const bottom = Math.max(...selected.map((box) => box.bottom));
  return { line: lines[0], top, bottom, center: (top + bottom) / 2 };
}

function lineFromY(
  y: number,
  boxes: LineBox[],
  lineCount: number,
  lineHeight: number,
): number {
  if (boxes.length === 0) {
    return clamp(Math.floor(y / lineHeight) + 1, 1, lineCount);
  }
  const containing = boxes.find((box) => y >= box.top && y <= box.bottom);
  if (containing !== undefined) return containing.line;
  const nearest = boxes.reduce((best, box) =>
    Math.abs(box.center - y) < Math.abs(best.center - y) ? box : best,
  );
  return nearest.line;
}

function selectionLinesFromRange(
  range: Range,
  root: HTMLElement,
  boxes: LineBox[],
  lineCount: number,
  lineHeight: number,
): LineRange | null {
  const rootRect = root.getBoundingClientRect();
  const lines = new Set<number>();
  for (const rect of rectsOf(range)) {
    const top = Math.max(0, rect.top - rootRect.top);
    const bottom = Math.max(top, rect.bottom - rootRect.top);
    lines.add(lineFromY((top + bottom) / 2, boxes, lineCount, lineHeight));
  }
  if (lines.size === 0) return null;
  const ordered = [...lines].sort((a, b) => a - b);
  return [ordered[0]!, ordered[ordered.length - 1]!];
}

function snippetForLines(content: string, lines: LineRange, max = 120): string {
  const text = content
    .split(/\r?\n/)
    .slice(lines[0] - 1, lines[1])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function targetMatches(
  active: CommentTarget | null,
  file: string,
  lines: LineRange,
): boolean {
  if (active === null || active.kind !== "event" || active.file !== file) {
    return false;
  }
  if (active.lines === undefined) return false;
  return rangeEquals(normalizeLines(active.lines, Number.MAX_SAFE_INTEGER), lines);
}

function targetFrom(file: string, lines: LineRange): CommentTarget {
  return { kind: "event", file, lines };
}

function layoutMarkers<T extends { lines: LineRange }>(
  items: T[],
  lineHeight: number,
  lineBoxes: LineBox[],
): MarkerLayout<T>[] {
  let nextCenter = Number.NEGATIVE_INFINITY;
  const minGap = 34;
  return [...items]
    .sort(
      (a, b) =>
        boxForRange(a.lines, lineBoxes, lineHeight).center -
        boxForRange(b.lines, lineBoxes, lineHeight).center,
    )
    .map((item) => {
      const box = boxForRange(item.lines, lineBoxes, lineHeight);
      const center = box.center;
      const visualCenter = Math.max(center, nextCenter);
      nextCenter = visualCenter + minGap;
      return { item, visualCenter, box };
    });
}

function payloadContent(event: AnyEventRecord): string {
  return (event.payload as ProsePayload).content.trim();
}

function isRemovedMarker(event: AnyEventRecord): boolean {
  const payload = event.payload as ProsePayload;
  return payload.content.trim() === "_removed_" && typeof payload.supersedes === "string";
}

function isResolvedMarker(event: AnyEventRecord): boolean {
  const payload = event.payload as ProsePayload;
  return payload.content.trim() === "_resolved_" && typeof payload.supersedes === "string";
}

export function LineCommentRail({
  event,
  content,
  comments,
  participants,
  mode = "rendered",
  className,
  lineHeight = 25,
}: Props): JSX.Element {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const currentUserId = useStore((s) => s.currentUserId);
  const token = useStore((s) => s.token);
  const activeTarget = useStore((s) => s.commentTarget);
  const setCommentTarget = useStore((s) => s.setCommentTarget);
  const setRightTab = useStore((s) => s.setRightTab);
  const upsertEvent = useStore((s) => s.upsertEvent);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [hoverLine, setHoverLine] = useState<number | null>(null);
  const [selectionLines, setSelectionLines] = useState<LineRange | null>(null);
  const [popoverTarget, setPopoverTarget] = useState<LineRange | null>(null);
  const [draft, setDraft] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<ProseMention[]>([]);
  const [mentionAnchorRect, setMentionAnchorRect] = useState<DOMRect | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const lineCount = Math.max(1, content.split(/\r?\n/).length);
  const [lineBoxes, setLineBoxes] = useState<LineBox[]>(() =>
    fallbackLineBoxes(lineCount, lineHeight),
  );

  function refreshLineBoxes(): LineBox[] {
    const measured = measureLineBoxes(contentRef.current, lineCount, lineHeight);
    setLineBoxes((prev) => (sameLineBoxes(prev, measured) ? prev : measured));
    return measured;
  }

  useLayoutEffect(() => {
    refreshLineBoxes();
  }, [content, mode, lineCount, lineHeight]);

  useEffect(() => {
    const root = contentRef.current;
    if (root === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => refreshLineBoxes());
    observer.observe(root);
    return () => observer.disconnect();
  }, [content, mode, lineCount, lineHeight]);

  /* Active highlight — when commentTarget points at THIS rail's event with a
     line range, render a tinted band over those source lines so the user
     sees which selection their open comment thread belongs to. Without this
     the feed dims everything except the focused card, but inside the card
     there's no signal of which lines were commented on. */
  const highlightLines: LineRange | null =
    activeTarget !== null &&
    activeTarget.kind === "event" &&
    activeTarget.file === event.filename &&
    activeTarget.lines !== undefined
      ? normalizeLines(activeTarget.lines, lineCount)
      : null;
  const selectedMentionIds = useMemo(
    () => new Set(selectedMentions.map((mention) => mention.participant_id)),
    [selectedMentions],
  );
  /* Default tags when opening a new draft:
       - prose authored by an agent → tag that agent (the most likely person
         the user wants to ping for a reply)
       - prose authored by a user → tag every agent that's actively attached
         to this session (broadcast to all helpers; the user can prune)
     User can always toggle these off in the picker before submitting. */
  const defaultMentions = useMemo<ProseMention[]>(() => {
    const author = participants[event.participant_id];
    if (author !== undefined && author.kind === "agent") {
      return [
        {
          participant_id: event.participant_id,
          display_name: author.name,
          token: `@${author.name}`,
        },
      ];
    }
    return Object.entries(participants)
      .filter(
        ([, p]) => p.kind === "agent" && p.active_session === currentSessionId,
      )
      .map(([id, p]) => ({
        participant_id: id,
        display_name: p.name,
        token: `@${p.name}`,
      }));
  }, [participants, event.participant_id, currentSessionId]);
  const currentWho =
    currentUserId !== null
      ? whoOf(currentUserId, participants)
      : { id: "us-local", name: "You", initial: "Y", isUser: true, runtimeId: null };

  const anchors = useMemo<AnchorGroup[]>(() => {
    const byLine = new Map<string, AnchorGroup>();
    for (const c of comments) {
      if (isRemovedMarker(c)) continue;
      const ct = getCommentTarget(c.payload as ProsePayload);
      const lines = normalizeLines(ct?.lines, lineCount);
      const key = lineKey(lines);
      const participant = participants[c.participant_id];
      const color =
        participant?.color ??
        (participant?.kind === "agent" ? "var(--agent)" : "var(--user)");
      const existing = byLine.get(key);
      if (existing !== undefined) {
        existing.comments.push(c);
        existing.resolved = existing.resolved || isResolvedMarker(c);
      } else {
        byLine.set(key, {
          key,
          lines,
          comments: [c],
          color,
          resolved: isResolvedMarker(c),
        });
      }
    }
    return [...byLine.values()].sort((a, b) => a.lines[0] - b.lines[0]);
  }, [comments, lineCount, participants]);

  const draftLines = selectionLines ?? (hoverLine !== null ? [hoverLine, hoverLine] : null);
  const visibleDraft = popoverTarget ?? draftLines;
  const visibleDraftKey =
    visibleDraft !== null ? lineKey(visibleDraft) : null;
  const savedDraftEntries = useMemo(
    () =>
      Object.entries(savedDrafts)
        .map(([key, text]) => {
          const lines = linesFromKey(key);
          return lines === null ? null : { key, lines, text };
        })
        .filter((entry): entry is { key: string; lines: LineRange; text: string } => entry !== null),
    [savedDrafts],
  );
  const existingMarkerLayouts = useMemo(
    () => layoutMarkers(anchors, lineHeight, lineBoxes),
    [anchors, lineHeight, lineBoxes],
  );
  const draftMarkerLayouts = useMemo(() => {
    const draftMarkers: {
      key: string;
      lines: LineRange;
      kind: "draft" | "saved-draft";
    }[] = savedDraftEntries
      .filter((entry) => entry.key !== visibleDraftKey)
      .map((entry) => ({
        key: entry.key,
        lines: entry.lines,
        kind: "saved-draft" as const,
      }));
    if (visibleDraft !== null) {
      draftMarkers.push({
        key: `visible-${lineKey(visibleDraft)}`,
        lines: visibleDraft,
        kind:
          savedDrafts[lineKey(visibleDraft)] !== undefined
            ? "saved-draft"
            : "draft",
      });
    }
    return layoutMarkers(draftMarkers, lineHeight, lineBoxes);
  }, [savedDraftEntries, savedDrafts, visibleDraft, visibleDraftKey, lineHeight, lineBoxes]);
  const popoverTop =
    popoverTarget !== null
      ? boxForRange(popoverTarget, lineBoxes, lineHeight).center
      : 0;

  function persistOrClearDraft(lines: LineRange, value: string): void {
    const key = lineKey(lines);
    setSavedDrafts((prev) => {
      const next = { ...prev };
      if (value.trim().length === 0) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function closeDraft(): void {
    if (popoverTarget !== null) {
      persistOrClearDraft(popoverTarget, draft);
    }
    setMentionAnchorRect(null);
    setSelectedMentions([]);
    setPopoverTarget(null);
    setSelectionLines(null);
    setDraft("");
    window.getSelection()?.removeAllRanges();
  }

  function discardDraft(): void {
    if (popoverTarget !== null) {
      const key = lineKey(popoverTarget);
      setSavedDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setMentionAnchorRect(null);
    setSelectedMentions([]);
    setPopoverTarget(null);
    setSelectionLines(null);
    setDraft("");
    window.getSelection()?.removeAllRanges();
  }

  useEffect(() => {
    if (popoverTarget !== null) {
      textareaRef.current?.focus();
    }
  }, [popoverTarget]);

  useEffect(() => {
    if (popoverTarget === null) return;
    function onDocumentMouseDown(e: globalThis.MouseEvent): void {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current?.contains(target) === true) return;
      if (wrapRef.current?.contains(target) === true) {
        const el = target instanceof Element ? target : target.parentElement;
        if (el?.closest(".line-comment-hit") !== null) return;
      }
      closeDraft();
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
    };
  }, [popoverTarget, draft]);

  function lineFromMouse(e: MouseEvent<HTMLDivElement>): number | null {
    const el = contentRef.current;
    if (el === null) return null;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < 0 || y > rect.height) return null;
    return lineFromY(y, lineBoxes, lineCount, lineHeight);
  }

  function onMouseMove(e: MouseEvent<HTMLDivElement>): void {
    const line = lineFromMouse(e);
    if (line !== null) setHoverLine(line);
  }

  function onMouseLeave(): void {
    if (popoverTarget === null) setHoverLine(null);
  }

  function onMouseUp(): void {
    const root = contentRef.current;
    if (root === null) return;
    const sel = window.getSelection();
    if (
      sel === null ||
      sel.rangeCount === 0 ||
      sel.isCollapsed ||
      sel.toString().trim().length === 0 ||
      sel.anchorNode === null ||
      sel.focusNode === null ||
      !root.contains(sel.anchorNode) ||
      !root.contains(sel.focusNode)
    ) {
      return;
    }
    const range = sel.getRangeAt(0);
    const lines = selectionLinesFromRange(
      range,
      root,
      refreshLineBoxes(),
      lineCount,
      lineHeight,
    );
    if (lines !== null) setSelectionLines(lines);
  }

  function openDraft(lines: LineRange): void {
    setSelectionLines(lines);
    setPopoverTarget(lines);
    setDraft(savedDrafts[lineKey(lines)] ?? "");
    setSelectedMentions(defaultMentions);
  }

  function focusComments(lines: LineRange): void {
    const target = targetFrom(event.filename, lines);
    setCommentTarget(target);
    setRightTab("comments");
  }

  function openMentions(): void {
    const rect =
      textareaRef.current?.getBoundingClientRect() ??
      popoverRef.current?.getBoundingClientRect() ??
      null;
    setMentionAnchorRect(rect);
  }

  function closeMentions(): void {
    setMentionAnchorRect(null);
  }

  /* Toggle a mention on/off in the picker. The picker stays open after
     each click so the user can chain multiple toggles. selectedMentions is
     the source of truth for who gets pinged on submit; the draft text is
     left untouched (the user can still type an @-name manually for context
     in the comment body, but we don't auto-insert tokens — that turned a
     5-agent broadcast into "@A @B @C @D @E " noise at the start). */
  function toggleMention(mention: ProseMention): void {
    setSelectedMentions((prev) =>
      prev.some((m) => m.participant_id === mention.participant_id)
        ? prev.filter((m) => m.participant_id !== mention.participant_id)
        : [...prev, mention],
    );
  }

  async function submitComment(): Promise<void> {
    const lines = popoverTarget;
    const trimmed = draft.trim();
    if (
      lines === null ||
      trimmed.length === 0 ||
      currentSessionId === null ||
      currentUserId === null
    ) {
      return;
    }

    setBusy(true);
    try {
      const client = createClient({ baseUrl: "", token });
      const managedClient = createManagedAgentsClient({ baseUrl: "", token });
      const target = targetFrom(event.filename, lines);
      const mentions = selectedMentions;
      const response = await client.postProse(currentSessionId, {
        participant_id: currentUserId,
        content: trimmed,
        append_to: event.filename,
        mode: "comment",
        lines,
        ...(mentions.length > 0 ? { mentions } : {}),
      });
      const wakeTargets = new Set(mentions.map((mention) => mention.participant_id));
      if (participants[event.participant_id]?.kind === "agent") {
        wakeTargets.add(event.participant_id);
      }
      if (wakeTargets.size > 0) {
        await managedClient.wakeSession(currentSessionId, {
          reason: "comment",
          source_event: response.filename,
          target_participant_ids: [...wakeTargets],
        });
      }
      const fresh = await client.listEvents(currentSessionId, {});
      for (const e of fresh) upsertEvent(e);
      setSavedDrafts((prev) => {
        const next = { ...prev };
        delete next[lineKey(lines)];
        return next;
      });
      setCommentTarget(target);
      setRightTab("comments");
      setMentionAnchorRect(null);
      setSelectedMentions([]);
      setPopoverTarget(null);
      setSelectionLines(null);
      setDraft("");
      window.getSelection()?.removeAllRanges();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      className="commentable"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onMouseUp={onMouseUp}
    >
      <div ref={contentRef} className="commentable-content">
        {highlightLines !== null && (
          <div
            className="line-comment-highlight"
            aria-hidden
            style={{
              top: boxForRange(highlightLines, lineBoxes, lineHeight).top,
              height:
                boxForRange(highlightLines, lineBoxes, lineHeight).bottom -
                boxForRange(highlightLines, lineBoxes, lineHeight).top,
            }}
          />
        )}
        <MarkdownRenderer content={content} mode={mode} className={className} />
      </div>
      <div className="line-comment-rail line-comment-rail-existing" aria-hidden={false}>
        {existingMarkerLayouts.map(({ item: a, visualCenter, box }) => (
          <LineMarker
            key={a.key}
            lines={a.lines}
            box={box}
            visualCenter={visualCenter}
            count={a.comments.filter((c) => payloadContent(c) !== "_resolved_").length}
            color={a.resolved ? "var(--green)" : a.color}
            active={targetMatches(activeTarget, event.filename, a.lines)}
            kind="existing"
            resolved={a.resolved}
            label={`Open ${a.comments.length === 1 ? "comment" : "comments"} on ${lineLabel(a.lines)}`}
            onClick={() => focusComments(a.lines)}
          />
        ))}
      </div>
      <div className="line-comment-rail line-comment-rail-draft" aria-hidden={false}>
        {draftMarkerLayouts.map(({ item, visualCenter, box }) => (
          <LineMarker
            key={item.key}
            lines={item.lines}
            box={box}
            visualCenter={visualCenter}
            count={null}
            color={item.kind === "saved-draft" ? "var(--agent)" : "var(--user)"}
            active={
              popoverTarget !== null &&
              rangeEquals(popoverTarget, item.lines)
            }
            kind={item.kind}
            label={
              item.kind === "saved-draft"
                ? `Resume draft on ${lineLabel(item.lines)}`
                : `Add comment on ${lineLabel(item.lines)}`
            }
            onClick={() => openDraft(item.lines)}
          />
        ))}
      </div>
      {popoverTarget !== null && (
        <div
          ref={popoverRef}
          className="line-comment-popover"
          style={{ top: popoverTop }}
        >
          <div className="line-comment-popover-head">
            <ParticipantAvatar
              participantId={currentWho.id}
              kind={currentWho.isUser ? "user" : "agent"}
              name={currentWho.name}
              color={currentWho.color}
              runtimeId={currentWho.runtimeId}
              size="sm"
            />
            <div className="line-comment-author">
              <b>{currentWho.name}</b>
              <span>{lineLabel(popoverTarget)}</span>
            </div>
            <button
              type="button"
              className="line-comment-close"
              aria-label="Close comment popover"
              onClick={closeDraft}
            >
              <X size={13} aria-hidden />
            </button>
          </div>
          <div className="line-comment-target-preview">
            {snippetForLines(content, popoverTarget) || lineLabel(popoverTarget)}
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value.endsWith("@")) openMentions();
            }}
            placeholder="Add a comment…"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                closeDraft();
                return;
              }
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submitComment();
              }
            }}
          />
          <div className="line-comment-popover-actions">
            {(draft.trim().length > 0 ||
              savedDrafts[lineKey(popoverTarget)] !== undefined) && (
              <button
                type="button"
                className="line-comment-discard"
                onClick={discardDraft}
                disabled={busy}
              >
                <Trash2 size={12} aria-hidden />
                Discard draft
              </button>
            )}
            <button
              type="button"
              className={[
                "line-comment-mention",
                selectedMentions.length > 0 ? "active" : "",
              ]
                .join(" ")
                .trim()}
              onClick={openMentions}
              disabled={busy}
              aria-label={
                selectedMentions.length === 0
                  ? "Tag agents"
                  : `Tagged: ${selectedMentions
                      .map((m) => m.display_name)
                      .join(", ")}`
              }
              title="Tag agents"
            >
              {selectedMentions.length === 0 ? (
                <>
                  <Bot size={13} aria-hidden />
                  Tag
                </>
              ) : (
                <span className="line-comment-mention-avatars">
                  {selectedMentions.map((m) => {
                    const p = participants[m.participant_id];
                    return (
                      <ParticipantAvatar
                        key={m.participant_id}
                        participantId={m.participant_id}
                        participant={p}
                        name={m.display_name}
                        kind="agent"
                        color={p?.color}
                        runtimeId={p?.runtime_id ?? null}
                        size="sm"
                      />
                    );
                  })}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => void submitComment()}
              disabled={busy || draft.trim().length === 0}
            >
              Comment
              <SendHorizontal size={13} aria-hidden />
            </button>
          </div>
          {mentionAnchorRect !== null ? (
            <AgentMentionPicker
              anchorRect={mentionAnchorRect}
              sessionId={currentSessionId}
              token={token}
              participants={participants}
              selectedIds={selectedMentionIds}
              onSelect={toggleMention}
              onClose={closeMentions}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

interface MarkerProps {
  lines: LineRange;
  box: LineBox;
  visualCenter?: number;
  count: number | null;
  color: string;
  active: boolean;
  kind: "draft" | "saved-draft" | "existing";
  resolved?: boolean;
  label: string;
  onClick(): void;
}

function LineMarker({
  lines,
  box,
  visualCenter,
  count,
  color,
  active,
  kind,
  resolved = false,
  label,
  onClick,
}: MarkerProps): JSX.Element {
  const anchorTop = box.top;
  const anchorBottom = box.bottom;
  const iconCenter = visualCenter ?? box.center;
  const top = Math.min(anchorTop, iconCenter - 15);
  const bottom = Math.max(anchorBottom, iconCenter + 15);
  const style = {
    top,
    height: bottom - top,
    "--rail-color": color,
    "--bar-top": `${anchorTop - top + 2}px`,
    "--bar-bottom": `${bottom - anchorBottom + 2}px`,
    "--icon-top": `${iconCenter - top}px`,
  } as CSSProperties;
  return (
    <div
      className={[
        "line-comment-anchor",
        kind,
        active ? "active" : "",
        resolved ? "resolved" : "",
      ].join(" ").trim()}
      style={style}
      data-target-lines={`${lines[0]}:${lines[1]}`}
    >
      <span className="line-comment-bar" aria-hidden />
      <button
        type="button"
        className={[
          "line-comment-marker",
          "line-comment-hit",
          kind,
          active ? "active" : "",
          resolved ? "resolved" : "",
        ].join(" ").trim()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }}
        aria-label={label}
      >
        <span className="line-comment-icon" aria-hidden>
          <MessageSquare size={13} />
        </span>
        {count !== null && count > 1 && (
          <span className="line-comment-count" aria-hidden>
            {count}
          </span>
        )}
      </button>
    </div>
  );
}
