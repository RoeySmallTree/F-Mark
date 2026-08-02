import type { JSX } from "react";
import type { ToolPresentation } from "../toolPresentation.js";
import { copyToClipboard } from "../../render/copy.js";
import {
  commandIcon,
  formatDuration,
  summaryTitle,
  toolType,
} from "./model.js";

const COPIED_CLASS = "is-copied";
const COPIED_MS = 900;

/* Mirrors FeedRows' anchor-flash pattern: a direct classList toggle rather
   than React state, so the transient affordance doesn't force a re-render
   of the whole tool header. */
function flashCopied(el: HTMLElement): void {
  el.classList.add(COPIED_CLASS);
  window.setTimeout(() => el.classList.remove(COPIED_CLASS), COPIED_MS);
}

async function copyArgument(text: string, el: HTMLElement): Promise<void> {
  await copyToClipboard(text);
  flashCopied(el);
}

interface ToolUseHeaderProps {
  durationMs: number | undefined;
  onToggle: () => void;
  open: boolean;
  pending: boolean;
  presentation: ToolPresentation;
  success: boolean;
  toolName: string;
}

function ToolStatus({
  pending,
  success,
}: {
  pending: boolean;
  success: boolean;
}): JSX.Element {
  if (pending) return <span className="spin" aria-hidden />;
  if (success) {
    return (
      <span className="ok-dot" aria-hidden>
        ✓
      </span>
    );
  }
  return (
    <span className="err-dot" aria-hidden>
      !
    </span>
  );
}

/* The tool chip's argument (file path, command, search pattern — whatever
   `intro`/`title` renders as) is the most copyable text in the app. It's a
   real, standalone <button> — NOT nested inside `.tool-head-toggle` below,
   because a <button> cannot legally contain interactive descendants (invalid
   HTML5 content model: AT exposure of the inner control is inconsistent
   across browsers, and it produces a tab stop nobody expects). Being a real
   button also means Enter/Space activation is native; no key handler needed. */
function ToolArgument({ text }: { text: string }): JSX.Element {
  function onClick(event: React.MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    void copyArgument(text, event.currentTarget);
  }

  return (
    <button
      type="button"
      className="tool-summary-primary tool-arg-copy"
      aria-label="Copy tool argument"
      onClick={onClick}
    >
      {text}
    </button>
  );
}

function ToolSummary({
  presentation,
  toolName,
}: {
  presentation: ToolPresentation;
  toolName: string;
}): JSX.Element {
  const CommandIcon = commandIcon(toolName, presentation.title);
  const intro = presentation.intro;
  const hasDetail = intro === undefined && presentation.titleDetail !== undefined;
  const argument = intro ?? presentation.title;

  return (
    <span
      className={`tool-summary${hasDetail ? " has-detail" : ""}`}
      title={intro ?? summaryTitle(presentation.title, presentation.titleDetail)}
    >
      {CommandIcon !== null ? (
        <CommandIcon className="tool-summary-icon" size={12} aria-hidden="true" />
      ) : null}
      <ToolArgument text={argument} />
      {hasDetail ? (
        <span className="tool-summary-muted">{presentation.titleDetail}</span>
      ) : null}
    </span>
  );
}

/* `.tool-head` used to BE the toggle <button>, wrapping everything including
   the (now-interactive) argument — invalid once the argument is its own
   button. It's a plain <div> now: still the flex row, still hover/active
   feedback (both work on any element, no focus needed), still owns the
   `.tool-head > .spin/.ok-dot/.err-dot` right-alignment trick. `onClick`
   here is mouse-only convenience (no role/tabIndex — a plain click handler
   isn't exposed to assistive tech, so it doesn't recreate the nesting
   problem); the real, keyboard-reachable toggle is `.tool-head-toggle`
   below, and its native click bubbles up to fire `onToggle` exactly once. */
export function ToolUseHeader({
  durationMs,
  onToggle,
  open,
  pending,
  presentation,
  success,
  toolName,
}: ToolUseHeaderProps): JSX.Element {
  const type = toolType(toolName);
  const duration = formatDuration(durationMs);

  return (
    <div className="tool-head" onClick={onToggle}>
      <button
        type="button"
        className="tool-head-toggle"
        aria-label="toggle tool details"
        aria-expanded={open}
      >
        <span className="chev" aria-hidden>
          ›
        </span>
        <span className={`tool-type ${type.cls}`}>
          <span className="g" aria-hidden />
          {type.label}
        </span>
      </button>
      <ToolSummary presentation={presentation} toolName={toolName} />
      <ToolStatus pending={pending} success={success} />
      {duration !== null ? <span className="tool-dur">{duration}</span> : null}
    </div>
  );
}
