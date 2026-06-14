/* ToolUseCard — per-event renderer for tool-use events, painted in the reference
   `.tool-call` vocabulary (agent-components.css).

   A native <details> row: a `.tool-type` badge (colored dot + tool kind) keyed
   off `iconForTool`, the `.tool-summary` detail, a live `.spin` / `.ok-dot` /
   `.err-dot` status, and an optional `.tool-dur`. Open by default while a result
   is still pending (the "turn ended mid-tool" case), on failure, or for compact
   internal tools. The body shows the presentation sections as `.io` blocks. */

import { useState, type JSX } from "react";
import type { ToolUseEventRecord } from "@f-mark/shared";
import { iconForTool } from "../feed/toolIcons.js";
import {
  presentToolUse,
  renderPresentationSections,
  renderRawDetails,
} from "./toolPresentation.js";

/** Map a tool to a reference `.tool-type` variant (dot colour + short label). */
function toolType(toolName: string): { cls: string; label: string } {
  switch (iconForTool(toolName)) {
    case "Terminal":
      return { cls: "t-bash", label: "Bash" };
    case "FileText":
    case "BookOpen":
      return { cls: "t-read", label: "Read" };
    case "Search":
    case "Filter":
      return { cls: "t-grep", label: "Search" };
    case "Edit3":
    case "FilePlus":
      return { cls: "t-edit", label: "Edit" };
    case "Globe":
      return { cls: "t-fetch", label: "Fetch" };
    default:
      return { cls: "t-bash", label: "Tool" };
  }
}

function formatDuration(ms: number | undefined): string | null {
  if (ms === undefined) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function summaryTitle(title: string, detail: string | undefined): string {
  return detail === undefined ? title : `${title} ${detail}`;
}

interface Props {
  event: ToolUseEventRecord;
}

export function ToolUseCard({ event }: Props): JSX.Element | null {
  const { tool_name, result, success, duration_ms } = event.payload;
  const presentation = presentToolUse(event.payload);
  const [open, setOpen] = useState(
    result === undefined || success === false || presentation?.compactInternal === true,
  );
  if (presentation === null) return null;
  const type = toolType(tool_name);
  const duration = formatDuration(duration_ms);
  const pending = result === undefined;
  const classes = [
    "tool-call",
    success ? "" : "error",
    presentation.compactInternal === true ? "internal" : "",
  ]
    .filter((c) => c.length > 0)
    .join(" ");

  return (
    <div
      className={`${classes}${open ? " open" : ""}`}
      data-event-kind="tool-use"
    >
      <button
        type="button"
        className="tool-head"
        aria-label="toggle tool details"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="chev" aria-hidden>
          ›
        </span>
        <span className={`tool-type ${type.cls}`}>
          <span className="g" aria-hidden />
          {type.label}
        </span>
        <span
          className={`tool-summary${presentation.titleDetail !== undefined ? " has-detail" : ""}`}
          title={summaryTitle(presentation.title, presentation.titleDetail)}
        >
          <span className="tool-summary-primary">{presentation.title}</span>
          {presentation.titleDetail !== undefined ? (
            <span className="tool-summary-muted">{presentation.titleDetail}</span>
          ) : null}
        </span>
        {pending ? (
          <span className="spin" aria-hidden />
        ) : success ? (
          <span className="ok-dot" aria-hidden>
            ✓
          </span>
        ) : (
          <span className="err-dot" aria-hidden>
            !
          </span>
        )}
        {duration !== null ? <span className="tool-dur">{duration}</span> : null}
      </button>
      {open ? (
        <div className="tool-body">
          {presentation.summary !== undefined ? (
            <p className="tool-summary-line">{presentation.summary}</p>
          ) : null}
          {renderPresentationSections(presentation.sections)}
          {presentation.raw !== undefined ? renderRawDetails(presentation.raw) : null}
        </div>
      ) : null}
    </div>
  );
}
