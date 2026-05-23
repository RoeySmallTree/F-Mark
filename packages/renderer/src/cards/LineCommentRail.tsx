import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type MouseEvent,
} from "react";
import { MessageSquare, SendHorizontal, X } from "lucide-react";
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
  return rangeEquals(normalizeLines(active.lines, Number.MAX_SAFE_INTEGER), lines);
}

function targetFrom(file: string, lines: LineRange): {
  file: string;
  lines: LineRange;
} {
  return { file, lines };
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [hoverLine, setHoverLine] = useState<number | null>(null);
  const [selectionLines, setSelectionLines] = useState<LineRange | null>(null);
  const [popoverTarget, setPopoverTarget] = useState<LineRange | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const lineCount = Math.max(1, content.split(/\r?\n/).length);
  const currentWho =
    currentUserId !== null
      ? whoOf(currentUserId, participants)
      : { name: "You", initial: "Y", isUser: true };

  const anchors = useMemo<AnchorGroup[]>(() => {
    const byLine = new Map<string, AnchorGroup>();
    for (const c of comments) {
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
      } else {
        byLine.set(key, { key, lines, comments: [c], color });
      }
    }
    return [...byLine.values()].sort((a, b) => a.lines[0] - b.lines[0]);
  }, [comments, lineCount, participants]);

  const draftLines = selectionLines ?? (hoverLine !== null ? [hoverLine, hoverLine] : null);
  const draftOverlapsExisting =
    draftLines !== null &&
    anchors.some((a) => rangeEquals(a.lines, draftLines));
  const visibleDraft = popoverTarget ?? (!draftOverlapsExisting ? draftLines : null);
  const popoverTop =
    popoverTarget !== null ? markerCenter(popoverTarget, lineHeight) : 0;

  useEffect(() => {
    if (popoverTarget !== null) {
      textareaRef.current?.focus();
    }
  }, [popoverTarget]);

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
    setDraft("");
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
      <div className="line-comment-rail" aria-hidden={false}>
        {anchors.map((a) => (
          <LineMarker
            key={a.key}
            lines={a.lines}
            lineHeight={lineHeight}
            count={a.comments.length}
            color={a.color}
            active={targetMatches(activeTarget, event.filename, a.lines)}
            kind="existing"
            label={`Open ${a.comments.length === 1 ? "comment" : "comments"} on ${lineLabel(a.lines)}`}
            onClick={() => focusComments(a.lines)}
          />
        ))}
        {visibleDraft !== null && (
          <LineMarker
            lines={visibleDraft}
            lineHeight={lineHeight}
            count={null}
            color="var(--user)"
            active={popoverTarget !== null}
            kind="draft"
            label={`Add comment on ${lineLabel(visibleDraft)}`}
            onClick={() => openDraft(visibleDraft)}
          />
        )}
      </div>
      {popoverTarget !== null && (
        <div className="line-comment-popover" style={{ top: popoverTop }}>
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
              onClick={() => setPopoverTarget(null)}
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
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void submitComment();
              }
            }}
          />
          <div className="line-comment-popover-actions">
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
  count: number | null;
  color: string;
  active: boolean;
  kind: "draft" | "existing";
  label: string;
  onClick(): void;
}

function LineMarker({
  lines,
  lineHeight,
  count,
  color,
  active,
  kind,
  label,
  onClick,
}: MarkerProps): JSX.Element {
  const top = (lines[0] - 1) * lineHeight;
  const height = Math.max(lineHeight, (lines[1] - lines[0] + 1) * lineHeight);
  const style = {
    top,
    height,
    "--rail-color": color,
  } as CSSProperties;
  return (
    <button
      type="button"
      className={[
        "line-comment-marker",
        kind,
        active ? "active" : "",
      ].join(" ").trim()}
      style={style}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      data-target-lines={`${lines[0]}:${lines[1]}`}
    >
      <span className="line-comment-bar" aria-hidden />
      <span className="line-comment-icon" aria-hidden>
        <MessageSquare size={13} />
      </span>
      {count !== null && count > 1 && (
        <span className="line-comment-count" aria-hidden>
          {count}
        </span>
      )}
    </button>
  );
}
