import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type MouseEvent,
} from "react";
import { MessageSquare, SendHorizontal, Trash2, X } from "lucide-react";
import type {
  AnyEventRecord,
  Participant,
  ProsePayload,
} from "@f-mark/shared";
import { getCommentTarget } from "@f-mark/shared";
import { createClient } from "../api/client.js";
import { MarkdownRenderer, type MarkdownMode } from "../render/MarkdownRenderer.js";
import { useStore } from "../state/store.js";
import { whoOf } from "./format.js";

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

function targetMatches(
  active: { file: string; lines?: LineRange } | null,
  file: string,
  lines: LineRange,
): boolean {
  if (active === null || active.file !== file) return false;
  if (active.lines === undefined) return false;
  return rangeEquals(normalizeLines(active.lines, Number.MAX_SAFE_INTEGER), lines);
}

function targetFrom(file: string, lines: LineRange): {
  file: string;
  lines: LineRange;
} {
  return { file, lines };
}

function layoutMarkers<T extends { lines: LineRange }>(
  items: T[],
  lineHeight: number,
): MarkerLayout<T>[] {
  let nextCenter = Number.NEGATIVE_INFINITY;
  const minGap = 34;
  return [...items]
    .sort(
      (a, b) =>
        markerCenter(a.lines, lineHeight) - markerCenter(b.lines, lineHeight),
    )
    .map((item) => {
      const center = markerCenter(item.lines, lineHeight);
      const visualCenter = Math.max(center, nextCenter);
      nextCenter = visualCenter + minGap;
      return { item, visualCenter };
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
  const [savedDrafts, setSavedDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const lineCount = Math.max(1, content.split(/\r?\n/).length);
  const currentWho =
    currentUserId !== null
      ? whoOf(currentUserId, participants)
      : { name: "You", initial: "Y", isUser: true };

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
    () => layoutMarkers(anchors, lineHeight),
    [anchors, lineHeight],
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
    return layoutMarkers(draftMarkers, lineHeight);
  }, [savedDraftEntries, savedDrafts, visibleDraft, visibleDraftKey, lineHeight]);
  const popoverTop =
    popoverTarget !== null ? markerCenter(popoverTarget, lineHeight) : 0;

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
    return clamp(Math.floor(y / lineHeight) + 1, 1, lineCount);
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
    const rangeRect = range.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const startY = Math.max(0, rangeRect.top - rootRect.top);
    const endY = Math.max(startY, rangeRect.bottom - rootRect.top);
    const start = clamp(Math.floor(startY / lineHeight) + 1, 1, lineCount);
    const end = clamp(Math.floor(Math.max(startY, endY - 1) / lineHeight) + 1, start, lineCount);
    setSelectionLines([start, end]);
  }

  function openDraft(lines: LineRange): void {
    setSelectionLines(lines);
    setPopoverTarget(lines);
    setDraft(savedDrafts[lineKey(lines)] ?? "");
  }

  function focusComments(lines: LineRange): void {
    const target = targetFrom(event.filename, lines);
    setCommentTarget(target);
    setRightTab("comments");
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
      const target = targetFrom(event.filename, lines);
      await client.postProse(currentSessionId, {
        participant_id: currentUserId,
        content: trimmed,
        append_to: event.filename,
        mode: "comment",
        lines,
      });
      const fresh = await client.listEvents(currentSessionId, {});
      for (const e of fresh) upsertEvent(e);
      setSavedDrafts((prev) => {
        const next = { ...prev };
        delete next[lineKey(lines)];
        return next;
      });
      setCommentTarget(target);
      setRightTab("comments");
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
        <MarkdownRenderer content={content} mode={mode} className={className} />
      </div>
      <div className="line-comment-rail line-comment-rail-existing" aria-hidden={false}>
        {existingMarkerLayouts.map(({ item: a, visualCenter }) => (
          <LineMarker
            key={a.key}
            lines={a.lines}
            lineHeight={lineHeight}
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
        {draftMarkerLayouts.map(({ item, visualCenter }) => (
          <LineMarker
            key={item.key}
            lines={item.lines}
            lineHeight={lineHeight}
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
            <span
              className={[
                "avatar",
                currentWho.isUser ? "user" : "agent",
                "sm",
              ].join(" ")}
              aria-hidden
            >
              {currentWho.initial}
            </span>
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
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
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
              onClick={() => void submitComment()}
              disabled={busy || draft.trim().length === 0}
            >
              Comment
              <SendHorizontal size={13} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function markerCenter(lines: LineRange, lineHeight: number): number {
  return (lines[0] - 1) * lineHeight + ((lines[1] - lines[0] + 1) * lineHeight) / 2;
}

interface MarkerProps {
  lines: LineRange;
  lineHeight: number;
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
  lineHeight,
  visualCenter,
  count,
  color,
  active,
  kind,
  resolved = false,
  label,
  onClick,
}: MarkerProps): JSX.Element {
  const anchorTop = (lines[0] - 1) * lineHeight;
  const anchorBottom =
    anchorTop + Math.max(lineHeight, (lines[1] - lines[0] + 1) * lineHeight);
  const iconCenter = visualCenter ?? markerCenter(lines, lineHeight);
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
