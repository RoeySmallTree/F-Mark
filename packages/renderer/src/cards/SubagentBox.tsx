import { useState, type JSX } from "react";
import type {
  SubagentOutputEventRecord,
  SubagentRunEventRecord,
} from "@f-mark/shared";
import type { GroupStatus } from "../feed/projectFeed.js";

type SubagentEvent = SubagentRunEventRecord | SubagentOutputEventRecord;

function statusOf(events: SubagentEvent[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const status = events[i]?.payload.status;
    if (typeof status === "string") return status;
  }
  return "unknown";
}

function isFailed(status: string): boolean {
  return status === "failed" || status === "cancelled";
}

/** Initials for the sub-agent avatar, e.g. "Code Reviewer" → "CR". */
export function subagentInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "SA";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase();
}

/** Map a runtime status to one of the reference sub-agent pill variants. */
export function subagentPillKind(status: string): "run" | "done" | "fail" {
  if (isFailed(status)) return "fail";
  if (status === "started" || status === "running" || status === "streaming") {
    return "run";
  }
  return "done";
}

/** Reference `.sa-pill` (run shows the pulsing dot). */
export function SubagentPill({ status }: { status: string }): JSX.Element {
  const kind = subagentPillKind(status);
  return (
    <span className={`sa-pill ${kind}`}>
      {kind === "run" ? <span className="run-dot" aria-hidden /> : null}
      {status}
    </span>
  );
}

function nameOf(events: SubagentEvent[]): string {
  for (const event of events) {
    const name =
      event.kind === "subagent-run"
        ? event.payload.name
        : event.payload.name ?? event.payload.subagent_id;
    if (name.length > 0) return name;
  }
  return "Sub-agent";
}

function sourceOf(events: SubagentEvent[]): string {
  const event = events[0];
  if (event === undefined) return "unknown";
  return `${event.payload.source}/${event.payload.source_confidence}`;
}

function idDetails(events: SubagentEvent[]): {
  id: string;
  correlation: string;
  parentTool?: string;
} {
  const event = events[0];
  if (event === undefined) return { id: "unknown", correlation: "unknown" };
  return {
    id: event.payload.subagent_id,
    correlation: event.payload.correlation_id,
    parentTool: event.payload.parent_tool_use_id,
  };
}

function sortedOutputs(events: SubagentEvent[]): SubagentOutputEventRecord[] {
  return events
    .filter((event): event is SubagentOutputEventRecord => event.kind === "subagent-output")
    .sort((a, b) => {
      const seq = a.payload.sequence - b.payload.sequence;
      return seq !== 0 ? seq : a.filename.localeCompare(b.filename);
    });
}

function firstRun(events: SubagentEvent[]): SubagentRunEventRecord | undefined {
  return events.find(
    (event): event is SubagentRunEventRecord => event.kind === "subagent-run",
  );
}

interface Props {
  events: SubagentEvent[];
  parentStatus: GroupStatus;
}

export function SubagentBox({ events, parentStatus }: Props): JSX.Element {
  const status = statusOf(events);
  const failed = isFailed(status);
  const [open, setOpen] = useState(
    failed || parentStatus === "streaming" || status === "started" || status === "running",
  );
  const run = firstRun(events);
  const outputs = sortedOutputs(events);
  const details = idDetails(events);
  const name = nameOf(events);

  return (
    <details
      className="subagent"
      data-event-kind="subagent"
      data-status={status}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="chev" aria-hidden>
          ›
        </span>
        <span className="sa-avatar">{subagentInitials(name)}</span>
        <div className="sa-id">
          <b>{name}</b>
          <span>subagent · {sourceOf(events)}</span>
        </div>
        <span className="sa-right">
          <SubagentPill status={status} />
        </span>
      </summary>
      <div className="subagent-body">
        {run?.payload.prompt_preview !== undefined ? (
          <div className="subagent-task">{run.payload.prompt_preview}</div>
        ) : null}
        {outputs.map((output) => (
          <div className="io" key={output.filename}>
            <div className="io-label">Output</div>
            <div className="io-raw">{output.payload.content}</div>
          </div>
        ))}
        <div className="subagent-meta" aria-label="Sub-agent metadata">
          <span>{details.id}</span>
          <span>{details.correlation}</span>
          {details.parentTool !== undefined ? <span>{details.parentTool}</span> : null}
        </div>
      </div>
    </details>
  );
}
