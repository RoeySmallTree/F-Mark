/* ToolUseCard — per-event renderer for tool-use events.

   Collapsed by default: shows a single header row with the tool's lucide
   icon (resolved via `iconForTool`), the tool name, an optional duration
   chip, and — when `success === false` — a "failed" pill that paints the
   header red. Clicking the header expands the body to show the JSON input
   and (if present) the result. We omit the result section entirely when
   `payload.result` is undefined, which is the "turn ended mid-tool" case
   the kernel emits when a turn is aborted between tool_use and tool_result.

   The icon component is looked up from a small NAME → Component map so we
   only pull the lucide-react exports we actually need (avoids namespace
   imports and keeps tree-shaking honest). Anything unknown falls back to
   the Wrench glyph, matching RightLog's tool-use kind tag. */

import { useState, type JSX } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Edit3,
  FilePlus,
  FileText,
  Filter,
  Globe,
  ListChecks,
  Search,
  Terminal,
  Users,
  Wrench,
} from "lucide-react";
import type { ToolUseEventRecord } from "@f-mark/shared";
import { iconForTool } from "../feed/toolIcons.js";

type IconComponent = typeof Wrench;

const ICONS: Record<string, IconComponent> = {
  Terminal,
  FileText,
  Edit3,
  FilePlus,
  Globe,
  Search,
  Filter,
  Users,
  BookOpen,
  ListChecks,
  Wrench,
};

function resolveIcon(toolName: string): IconComponent {
  const name = iconForTool(toolName);
  return ICONS[name] ?? Wrench;
}

function formatDuration(ms: number | undefined): string | null {
  if (ms === undefined) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function stringifyForDisplay(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

interface Props {
  event: ToolUseEventRecord;
}

export function ToolUseCard({ event }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const { tool_name, input, result, success, duration_ms } = event.payload;
  const Icon = resolveIcon(tool_name);
  const duration = formatDuration(duration_ms);
  const classes = ["tool-use-card", success ? "" : "error"]
    .filter((c) => c.length > 0)
    .join(" ");

  return (
    <div className={classes} data-event-kind="tool-use">
      <button
        type="button"
        className="tool-use-head"
        aria-label="toggle tool details"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tool-use-chevron" aria-hidden>
          {open ? (
            <ChevronDown size={12} aria-hidden />
          ) : (
            <ChevronRight size={12} aria-hidden />
          )}
        </span>
        <Icon size={13} aria-hidden />
        <span className="tool-use-name">{tool_name}</span>
        {!success && <span className="tool-use-status">failed</span>}
        {duration !== null && (
          <span className="tool-use-duration">{duration}</span>
        )}
      </button>
      {open && (
        <div className="tool-use-body">
          <section className="tool-use-section">
            <h4>input</h4>
            <pre>{stringifyForDisplay(input)}</pre>
          </section>
          {result !== undefined && (
            <section className="tool-use-section">
              <h4>result</h4>
              <pre>{stringifyForDisplay(result)}</pre>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
