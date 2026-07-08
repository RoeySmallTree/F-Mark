import type { CSSProperties } from "react";
import {
  AGENT_ACTIVITY_STATES,
  AGENT_CONNECTION_STATES,
  AGENT_CONTEXT_STATUSES,
  RUNTIME_STATE_SOURCES,
  type AgentStatusRow,
  type AnyEventRecord,
  type Participant,
} from "@f-mark/shared";
import { accessRequestOpen } from "../../../cards/AccessRequestCard.js";
import type { BusyState, RenameDraft } from "./types.js";

const agentToneStates = {
  paused: "paused",
  removed: "removed",
} as const;

const agentStatusMessages = {
  notConnected: "Agent is not connected",
  notControllable: "Agent has no live controllable pane",
  telemetryPending: "Telemetry pending",
  unavailable: "Unavailable",
  contextUnavailable: "Context usage is unavailable for this runtime.",
  waitingForTelemetry: "Waiting for live context telemetry.",
  providerDefault: "Provider default",
  runtimeTelemetry: "Runtime telemetry",
} as const;

const runtimeSourceLabels = {
  [RUNTIME_STATE_SOURCES.override]: "Configured override",
  [RUNTIME_STATE_SOURCES.config]: "Provider catalog",
  [RUNTIME_STATE_SOURCES.rollout]: "Codex rollout",
  [RUNTIME_STATE_SOURCES.transcript]: "Claude transcript",
  [RUNTIME_STATE_SOURCES.opencodeDb]: "OpenCode database",
  [RUNTIME_STATE_SOURCES.sqlite]: "OpenCode SQLite",
  [RUNTIME_STATE_SOURCES.export]: "OpenCode export",
  [RUNTIME_STATE_SOURCES.unknown]: agentStatusMessages.runtimeTelemetry,
} as const;

function statusTone(agent: AgentStatusRow): string {
  if (agent.membership_state === agentToneStates.removed)
    return agentToneStates.removed;
  if (agent.paused) return agentToneStates.paused;
  if (agent.connection_state === AGENT_CONNECTION_STATES.connected) {
    return agent.activity_state;
  }
  return agent.connection_state;
}

function commandDisabledReason(agent: AgentStatusRow): string | null {
  if (!agent.controllable) return agentStatusMessages.notControllable;
  if (agent.connection_state !== AGENT_CONNECTION_STATES.connected) {
    return agentStatusMessages.notConnected;
  }
  if (
    agent.activity_state === AGENT_ACTIVITY_STATES.running ||
    agent.activity_state === AGENT_ACTIVITY_STATES.notified ||
    agent.activity_state === AGENT_ACTIVITY_STATES.accessPending
  ) {
    return `Agent is ${agent.activity_state}`;
  }
  return null;
}

export function commandTitle(label: string, reason: string | null): string {
  return reason === null ? label : `${label}: ${reason}`;
}

function formatTokens(value: number | null): string {
  if (value === null) return agentStatusMessages.telemetryPending;
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}

export function formatContextTokens(
  agent: AgentStatusRow,
  value: number | null,
): string {
  if (value !== null) return formatTokens(value);
  if (agent.context.status === AGENT_CONTEXT_STATUSES.unsupported) {
    return agentStatusMessages.unavailable;
  }
  return agentStatusMessages.telemetryPending;
}

export function contextPercentValue(agent: AgentStatusRow): number | null {
  const used = agent.context.used_tokens;
  const max = agent.context.max_tokens;
  if (used === null || max === null || max <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((used / max) * 100)));
}

export function contextPercent(agent: AgentStatusRow): string | null {
  const value = contextPercentValue(agent);
  return value === null ? null : `${value}% used`;
}

export function contextFallback(agent: AgentStatusRow): string {
  if (agent.context.status === AGENT_CONTEXT_STATUSES.unsupported) {
    return agentStatusMessages.contextUnavailable;
  }
  return agent.context.reason ?? agentStatusMessages.waitingForTelemetry;
}

export function modelLabel(agent: AgentStatusRow): string {
  return (
    agent.runtime_state?.configuredModel ??
    agent.runtime_state?.model ??
    agentStatusMessages.providerDefault
  );
}

export function effortLabel(agent: AgentStatusRow): string {
  return (
    agent.runtime_state?.configuredEffort ??
    agent.runtime_state?.effort ??
    agentStatusMessages.providerDefault
  );
}

export function sourceLabel(agent: AgentStatusRow): string {
  const source = agent.runtime_state?.source;
  return source === undefined
    ? agentStatusMessages.runtimeTelemetry
    : runtimeSourceLabels[source];
}

export class RightAgentViewModel {
  constructor(
    readonly agent: AgentStatusRow,
    private readonly participants: Record<string, Participant>,
    private readonly events: AnyEventRecord[],
    private readonly busy: BusyState | null,
    private readonly editing: RenameDraft | null,
    private readonly pickingColorFor: string | null,
  ) {}

  get id(): string {
    return this.agent.participant_id;
  }

  get tone(): string {
    return statusTone(this.agent);
  }

  get commandReason(): string | null {
    return commandDisabledReason(this.agent);
  }

  get compactDisabled(): boolean {
    return this.commandReason !== null || this.agent.runtime_id === null;
  }

  get clearDisabled(): boolean {
    return this.commandReason !== null;
  }

  get isBusy(): boolean {
    return this.busy?.id === this.id;
  }

  get isEditing(): boolean {
    return this.editing?.id === this.id;
  }

  get isPickingColor(): boolean {
    return this.pickingColorFor === this.id;
  }

  get agentColor(): string | null {
    return this.participants[this.id]?.color ?? null;
  }

  get canOpenTerminal(): boolean {
    return (
      this.agent.tmux_session !== null &&
      this.agent.membership_state !== agentToneStates.removed
    );
  }

  get pendingRequests(): AnyEventRecord[] {
    return this.events.filter(
      (event) =>
        event.participant_id === this.id && accessRequestOpen(event, this.events),
    );
  }

  get rowStyle(): CSSProperties | undefined {
    return this.agentColor !== null
      ? ({ "--agent-color": this.agentColor } as CSSProperties)
      : undefined;
  }
}
