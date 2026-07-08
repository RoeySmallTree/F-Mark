import { useState, type JSX } from "react";
import {
  EVENT_KINDS,
  type SubagentOutputEventRecord,
  type SubagentRunEventRecord,
} from "@f-mark/shared";
import type { GroupStatus } from "../feed/projectFeed.js";

type SubagentEvent = SubagentRunEventRecord | SubagentOutputEventRecord;

const subagentStatuses = {
  unknown: "unknown",
  failed: "failed",
  cancelled: "cancelled",
  started: "started",
  running: "running",
  streaming: "streaming",
} as const;

const subagentPillKinds = {
  run: "run",
  done: "done",
  fail: "fail",
} as const;

const subagentFallbacks = {
  initials: "SA",
  name: "Sub-agent",
} as const;

function statusOf(events: SubagentEvent[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const status = events[i]?.payload.status;
    if (typeof status === "string") return status;
  }
  return subagentStatuses.unknown;
}

function isFailed(status: string): boolean {
  return (
    status === subagentStatuses.failed ||
    status === subagentStatuses.cancelled
  );
}

/** Initials for the sub-agent avatar, e.g. "Code Reviewer" → "CR". */
export function subagentInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return subagentFallbacks.initials;
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase();
}

/** Map a runtime status to one of the reference sub-agent pill variants. */
function subagentPillKind(status: string): "run" | "done" | "fail" {
  if (isFailed(status)) return subagentPillKinds.fail;
  if (
    status === subagentStatuses.started ||
    status === subagentStatuses.running ||
    status === subagentStatuses.streaming
  ) {
    return subagentPillKinds.run;
  }
  return subagentPillKinds.done;
}

/** Reference `.sa-pill` (run shows the pulsing dot). */
export function SubagentPill({ status }: { status: string }): JSX.Element {
  const kind = subagentPillKind(status);
  return (
    <span className={`sa-pill ${kind}`}>
      {kind === subagentPillKinds.run ? (
        <span className="run-dot" aria-hidden />
      ) : null}
      {status}
    </span>
  );
}

function nameOf(events: SubagentEvent[]): string {
  for (const event of events) {
    const name =
      event.kind === EVENT_KINDS.subagentRun
        ? event.payload.name
        : event.payload.name ?? event.payload.subagent_id;
    if (name.length > 0) return name;
  }
  return subagentFallbacks.name;
}

function sourceOf(events: SubagentEvent[]): string {
  const event = events[0];
  if (event === undefined) return subagentStatuses.unknown;
  return `${event.payload.source}/${event.payload.source_confidence}`;
}

function idDetails(events: SubagentEvent[]): {
  id: string;
  correlation: string;
  parentTool?: string;
} {
  const event = events[0];
  if (event === undefined) {
    return {
      id: subagentStatuses.unknown,
      correlation: subagentStatuses.unknown,
    };
  }
  return {
    id: event.payload.subagent_id,
    correlation: event.payload.correlation_id,
    parentTool: event.payload.parent_tool_use_id,
  };
}

function sortedOutputs(events: SubagentEvent[]): SubagentOutputEventRecord[] {
  return events
    .filter(
      (event): event is SubagentOutputEventRecord =>
        event.kind === EVENT_KINDS.subagentOutput,
    )
    .sort((a, b) => {
      const seq = a.payload.sequence - b.payload.sequence;
      return seq !== 0 ? seq : a.filename.localeCompare(b.filename);
    });
}

function firstRun(events: SubagentEvent[]): SubagentRunEventRecord | undefined {
  return events.find(
    (event): event is SubagentRunEventRecord =>
      event.kind === EVENT_KINDS.subagentRun,
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
    failed ||
      parentStatus === subagentStatuses.streaming ||
      status === subagentStatuses.started ||
      status === subagentStatuses.running,
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
