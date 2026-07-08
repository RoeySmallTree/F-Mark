import type { JSX } from "react";
import type { ToolPresentation } from "../toolPresentation.js";
import {
  commandIcon,
  formatDuration,
  summaryTitle,
  toolType,
} from "./model.js";

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

  return (
    <span
      className={`tool-summary${hasDetail ? " has-detail" : ""}`}
      title={intro ?? summaryTitle(presentation.title, presentation.titleDetail)}
    >
      {CommandIcon !== null ? (
        <CommandIcon className="tool-summary-icon" size={12} aria-hidden="true" />
      ) : null}
      <span className="tool-summary-primary">{intro ?? presentation.title}</span>
      {hasDetail ? (
        <span className="tool-summary-muted">{presentation.titleDetail}</span>
      ) : null}
    </span>
  );
}

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
    <button
      type="button"
      className="tool-head"
      aria-label="toggle tool details"
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="chev" aria-hidden>
        ›
      </span>
      <span className={`tool-type ${type.cls}`}>
        <span className="g" aria-hidden />
        {type.label}
      </span>
      <ToolSummary presentation={presentation} toolName={toolName} />
      <ToolStatus pending={pending} success={success} />
      {duration !== null ? <span className="tool-dur">{duration}</span> : null}
    </button>
  );
}
