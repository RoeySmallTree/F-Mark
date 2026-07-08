/* BlockAccordion — renders an anchor's blocks as a folded list.
   Each block becomes one fold; the fold's title comes from the block's
   `name` (prose) or a kind-default; the body uses the same inline
   renderer registry as the rendered view (ProseInlineBlock).

   Folds open by default; clicking the chevron toggles.
   Nesting (block whose own children are blocks) is intentionally left
   out because aggregation is currently a flat blocks-by-anchor map. */

import { useState, type JSX } from "react";
import {
  CheckSquare,
  ChevronRight,
  FileCode2,
  Flag,
  GitFork,
  ListChecks,
  MousePointerClick,
  Paperclip,
  ShieldAlert,
  Text,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type {
  AnyEventRecord,
  EventKind,
  Participant,
  ProsePayload,
} from "@f-mark/shared";
import { type MarkdownMode } from "./MarkdownRenderer.js";
import { ProseInlineBlock } from "../cards/ProseInlineBlock.js";

interface Props {
  blocks: AnyEventRecord[];
  participants: Record<string, Participant>;
  /** Lookup of per-block comments. Each block's fold mounts the same
   *  inline renderer as the rendered view; the renderer passes the
   *  block's comment slice through to LineCommentRail. */
  commentsByFilename?: Map<string, AnyEventRecord[]>;
  /** Optional synthetic legacy block to render as the first fold. */
  legacyBlock?: AnyEventRecord;
  /** Comments for the legacy synthetic block (anchor's own comments). */
  legacyComments?: AnyEventRecord[];
  className?: string;
}

const KIND_FALLBACK_LABEL: Record<EventKind, string> = {
  prose: "Prose",
  flow: "Flow",
  file: "File",
  html: "Embed",
  choices: "Choices",
  todo: "Todo",
  "tool-use": "Tool use",
  "subagent-run": "Sub-agent run",
  "subagent-output": "Sub-agent output",
  "turn-end": "Turn end",
  choice: "Choice",
  "access-request": "Access request",
  "access-response": "Access response",
  "fork-link": "Fork link",
};

const KIND_ICON: Record<EventKind, LucideIcon> = {
  prose: Text,
  choices: ListChecks,
  choice: MousePointerClick,
  "turn-end": Flag,
  todo: CheckSquare,
  html: FileCode2,
  file: Paperclip,
  "tool-use": Wrench,
  "subagent-run": Workflow,
  "subagent-output": Text,
  flow: Workflow,
  "access-request": ShieldAlert,
  "access-response": ShieldAlert,
  "fork-link": GitFork,
};

const eventKinds = {
  prose: "prose",
  file: "file",
} as const satisfies Partial<Record<EventKind, EventKind>>;

const kindTitleFields: Partial<Record<EventKind, string[]>> = {
  flow: ["title", "id"],
  html: ["title", "id"],
  choices: ["question", "id"],
  todo: ["title", "body", "id"],
  "tool-use": ["tool_name", "tool_use_id"],
  "subagent-run": ["name", "role", "prompt_preview", "subagent_id"],
  "subagent-output": ["name", "content", "subagent_id"],
  "access-request": ["title", "message", "tool_name", "request_id"],
  "access-response": ["message", "decision", "request_id"],
  choice: ["choices_id"],
  "fork-link": ["title", "target_session_id", "source_session_id"],
};

function normalizeMarkdownTitle(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length === 0) return "";
  if (trimmed === "---" || /^(```|~~~)/.test(trimmed)) return "";
  return trimmed
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_`~]/g, "")
    .trim();
}

function firstMeaningfulLine(text: string | undefined): string | undefined {
  if (typeof text !== "string") return undefined;
  for (const raw of text.split(/\r?\n/)) {
    const title = normalizeMarkdownTitle(raw);
    if (title.length > 0) return title;
  }
  return undefined;
}

function payloadRecord(event: AnyEventRecord): Record<string, unknown> {
  const payload = event.payload;
  return payload !== null && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
}

function field(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function titleFromFields(
  payload: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const title = firstMeaningfulLine(field(payload, key));
    if (title !== undefined) return title;
  }
  return undefined;
}

function basename(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? path;
}

function blockLabel(event: AnyEventRecord, fallback?: string): string {
  const payload = payloadRecord(event);
  if (event.kind === eventKinds.prose) {
    const name = (event.payload as ProsePayload).name?.trim();
    return (
      firstMeaningfulLine((event.payload as ProsePayload).content) ??
      (name !== undefined && name.length > 0 ? name : undefined) ??
      fallback ??
      KIND_FALLBACK_LABEL.prose
    );
  }
  if (event.kind === eventKinds.file) {
    return (
      titleFromFields(payload, ["display_name", "description"]) ??
      basename(field(payload, "path")) ??
      field(payload, "id") ??
      fallback ??
      KIND_FALLBACK_LABEL.file
    );
  }
  return (
    titleFromFields(payload, kindTitleFields[event.kind] ?? []) ??
    fallback ??
    KIND_FALLBACK_LABEL[event.kind]
  );
}

interface FoldProps {
  event: AnyEventRecord;
  title: string;
  participants: Record<string, Participant>;
  comments: AnyEventRecord[];
  initiallyOpen: boolean;
}

function Fold({
  event,
  title,
  participants,
  comments,
  initiallyOpen,
}: FoldProps): JSX.Element {
  const [open, setOpen] = useState(initiallyOpen);
  const Icon = KIND_ICON[event.kind];
  const kindLabel = KIND_FALLBACK_LABEL[event.kind];
  return (
    <div
      className={`fm-accordion-section${open ? " open" : ""}`}
      data-block-fold-kind={event.kind}
    >
      <button
        type="button"
        className="fm-accordion-h1"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={`fm-accordion-chevron${open ? " fm-accordion-chevron-open" : ""}`}
          aria-hidden
        >
          <ChevronRight size={14} aria-hidden />
        </span>
        <span className="fm-accordion-title">{title}</span>
        <span
          className="fm-accordion-chip fm-accordion-icon-chip"
          role="img"
          aria-label={kindLabel}
          title={kindLabel}
        >
          <Icon size={14} aria-hidden />
        </span>
      </button>
      {open && (
        <div className="fm-accordion-body">
          {/* The inline renderer here intentionally re-mounts on
              open/close (cheap for prose, costlier for flow). Lazy
              mounting is the v1 perf strategy. */}
          <ProseInlineBlock
            event={event}
            participants={participants}
            comments={comments}
            mode={"rendered" as MarkdownMode}
          />
        </div>
      )}
    </div>
  );
}

export function BlockAccordion({
  blocks,
  participants,
  commentsByFilename,
  legacyBlock,
  legacyComments,
  className,
}: Props): JSX.Element {
  const cls = "fm-accordion fm-block-accordion" + (className ? " " + className : "");
  const folds: { event: AnyEventRecord; title: string; comments: AnyEventRecord[] }[] = [];

  if (legacyBlock !== undefined) {
    folds.push({
      event: legacyBlock,
      title: blockLabel(legacyBlock, "Legacy content"),
      comments: legacyComments ?? [],
    });
  }
  for (const b of blocks) {
    folds.push({
      event: b,
      title: blockLabel(b),
      comments: commentsByFilename?.get(b.filename) ?? [],
    });
  }

  return (
    <div className={cls}>
      <div className="fm-accordion-sections">
        {folds.map((f) => (
          <Fold
            key={f.event.filename + f.title}
            event={f.event}
            title={f.title}
            participants={participants}
            comments={f.comments}
            initiallyOpen={false}
          />
        ))}
      </div>
    </div>
  );
}
