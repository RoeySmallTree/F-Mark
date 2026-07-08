import type { JSX } from "react";
import type {
  SubagentOutputEventRecord,
  SubagentRunEventRecord,
} from "@f-mark/shared";
import { SubagentPill, subagentInitials } from "./SubagentBox.js";

const NO_LOOSE_STRING_VALUES = {
  subagentRun: "subagent-run",
} as const;

type SubagentEvent = SubagentRunEventRecord | SubagentOutputEventRecord;

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function SubagentCard({ event }: { event: SubagentEvent }): JSX.Element {
  if (event.kind === NO_LOOSE_STRING_VALUES.subagentRun) {
    const payload = event.payload;
    return (
      <div className="subagent" data-event-kind="subagent-run" data-status={payload.status}>
        <div className="subagent-head">
          <span className="sa-avatar">{subagentInitials(payload.name)}</span>
          <div className="sa-id">
            <b>{payload.name}</b>
            <span>subagent · {payload.source}</span>
          </div>
          <span className="sa-right">
            <SubagentPill status={payload.status} />
          </span>
        </div>
        <div className="subagent-body">
          {payload.prompt_preview !== undefined ? (
            <div className="subagent-task">{payload.prompt_preview}</div>
          ) : null}
          <div className="io">
            <div className="io-label">Sub-agent</div>
            <div className="io-json">
              {stringify({
                id: payload.subagent_id,
                role: payload.role,
                correlation_id: payload.correlation_id,
                confidence: payload.source_confidence,
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const payload = event.payload;
  return (
    <div className="subagent" data-event-kind="subagent-output" data-status={payload.status ?? ""}>
      <div className="subagent-head">
        <span className="sa-avatar">
          {subagentInitials(payload.name ?? payload.subagent_id)}
        </span>
        <div className="sa-id">
          <b>{payload.name ?? payload.subagent_id}</b>
          <span>subagent · {payload.source}</span>
        </div>
        {payload.status !== undefined ? (
          <span className="sa-right">
            <SubagentPill status={payload.status} />
          </span>
        ) : null}
      </div>
      <div className="subagent-body">
        <div className="io">
          <div className="io-label">Output</div>
          <div className="io-raw">{payload.content}</div>
        </div>
      </div>
    </div>
  );
}
