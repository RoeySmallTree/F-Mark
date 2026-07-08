/* AgentChip — a compact identity chip for a managed agent. Renders three
   visual layers:

     1. Runtime icon keyed off runtimeId / participant name.
     2. Participant name.
     3. State dot + conditional badges:
          - `exited` pill when state === "pane-dead"
          - wrench glyph when state === "hook-not-installed"

   The dot's color is driven by a CSS class on `.agent-chip-dot`. See
   `chips.css` for the per-state colors that resolve through the theme
   tokens defined in tokens.css. */

import type { CSSProperties, JSX, KeyboardEvent, MouseEvent } from "react";
import {
  AGENT_ACTIVITY_STATES,
  PARTICIPANT_KINDS,
  PRESENCE_STATES,
  RUNTIME_STATE_SOURCES,
  runtimeAccessModeLabel,
  type AgentActivityState,
  type CurrentRuntimeState,
  type PresenceState,
} from "@f-mark/shared";
import { Gauge, ShieldCheck } from "lucide-react";
import { avatarKind, AgentKindArt } from "./ParticipantAvatar.js";
import "./chips.css";

const modelSourceTitles = {
  override: "Configured override (not yet observed live)",
  config: "Provider catalog",
} as const;

const liveModelSources: ReadonlySet<CurrentRuntimeState["source"]> = new Set([
  RUNTIME_STATE_SOURCES.transcript,
  RUNTIME_STATE_SOURCES.rollout,
  RUNTIME_STATE_SOURCES.opencodeDb,
]);

export interface AgentChipProps {
  participantId: string;
  name: string;
  runtimeId: string | null;
  state: PresenceState;
  color?: string | null;
  active?: boolean;
  accessPending?: boolean;
  pendingAccessCount?: number;
  runtimeState?: CurrentRuntimeState;
  accessMode?: string;
  activityState?: AgentActivityState;
  expanded?: boolean;
  onClick?: (event: KeyboardEvent<HTMLElement> | MouseEvent<HTMLElement>) => void;
  onModelBadgeClick?: (event: MouseEvent<HTMLElement>) => void;
}

function shortenModel(id: string): string {
  // claude-fable-5 -> Fable 5; aliases such as fable -> Fable.
  const claudeMatch = id.match(/^claude-(fable|opus|sonnet|haiku)-(\d+)(?:-(\d+))?/i);
  if (claudeMatch) {
    const [, fam, maj, min] = claudeMatch;
    return `${fam!.charAt(0).toUpperCase()}${fam!.slice(1)} ${
      min ? `${maj}.${min}` : maj
    }`;
  }
  if (/^(fable|opus|sonnet|haiku)$/i.test(id)) {
    return `${id.charAt(0).toUpperCase()}${id.slice(1)}`;
  }
  // provider/model → model
  if (id.includes("/")) return id.split("/").pop() ?? id;
  return id;
}

function agentStatus(
  state: PresenceState,
  accessPending: boolean,
  activityState: AgentActivityState | undefined,
): string {
  if (accessPending || activityState === AGENT_ACTIVITY_STATES.accessPending) {
    return AGENT_ACTIVITY_STATES.accessPending;
  }
  if (
    activityState === AGENT_ACTIVITY_STATES.running ||
    activityState === AGENT_ACTIVITY_STATES.notified
  ) {
    return activityState;
  }
  return state;
}

function agentChipStyle(color: string | null | undefined): CSSProperties | undefined {
  if (typeof color !== "string" || color.length === 0) return undefined;
  return { "--agent-color": color } as CSSProperties;
}

function RuntimeIcon({
  participantId,
  name,
  runtimeId,
}: Pick<AgentChipProps, "participantId" | "name" | "runtimeId">): JSX.Element {
  return (
    <span className="agent-chip-runtime" aria-hidden>
      <AgentKindArt
        kind={avatarKind({
          participantId,
          kind: PARTICIPANT_KINDS.agent,
          name,
          runtimeId,
        })}
        className="agent-chip-runtime-art"
      />
    </span>
  );
}

function modelSourceTitle(source: CurrentRuntimeState["source"]): string {
  if (source === RUNTIME_STATE_SOURCES.override) {
    return modelSourceTitles.override;
  }
  if (source === RUNTIME_STATE_SOURCES.config) return modelSourceTitles.config;
  if (liveModelSources.has(source)) {
    return `Live from ${source}`;
  }
  return source;
}

function contextPercent(runtimeState: CurrentRuntimeState | undefined): number | null {
  const used = runtimeState?.contextUsedTokens;
  const max = runtimeState?.contextWindowTokens;
  if (typeof used !== "number" || typeof max !== "number" || max <= 0) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round((used / max) * 100)));
}

function statusDotStyle(
  runtimeState: CurrentRuntimeState | undefined,
): CSSProperties | undefined {
  const percent = contextPercent(runtimeState);
  return percent === null
    ? undefined
    : ({ "--agent-chip-context": `${percent}%` } as CSSProperties);
}

function effortText(runtimeState: CurrentRuntimeState | undefined): string | null {
  return runtimeState?.effort ?? runtimeState?.configuredEffort ?? null;
}

function AgentChipMetaIcons({
  runtimeId,
  runtimeState,
  accessMode,
}: Pick<
  AgentChipProps,
  "accessMode" | "runtimeId" | "runtimeState"
>): JSX.Element | null {
  const effort = effortText(runtimeState);
  if (accessMode === undefined && effort === null) return null;
  return (
    <span className="agent-chip-icons" aria-hidden="true">
      {accessMode !== undefined ? (
        <span
          className="agent-chip-icon"
          title={`Permissions: ${runtimeAccessModeLabel(runtimeId, accessMode)}`}
        >
          <ShieldCheck size={11} aria-hidden="true" />
        </span>
      ) : null}
      {effort !== null ? (
        <span className="agent-chip-icon" title={`Effort: ${effort}`}>
          <Gauge size={11} aria-hidden="true" />
        </span>
      ) : null}
    </span>
  );
}

interface ModelBadgeState {
  model: string;
  effort: string | undefined;
  title: string;
}

function modelBadgeState(
  runtimeState: CurrentRuntimeState | undefined,
): ModelBadgeState | null {
  if (runtimeState === undefined) return null;
  const model = runtimeState.model ?? runtimeState.configuredModel;
  if (model === undefined) return null;
  return {
    model,
    effort: runtimeState.effort ?? runtimeState.configuredEffort,
    title: modelSourceTitle(runtimeState.source),
  };
}

function ModelBadge({
  runtimeState,
  onModelBadgeClick,
}: Pick<AgentChipProps, "runtimeState" | "onModelBadgeClick">): JSX.Element | null {
  const badge = modelBadgeState(runtimeState);
  if (badge === null) return null;
  const content = (
    <>
      <span className="agent-chip-model-name">{shortenModel(badge.model)}</span>
      {badge.effort !== undefined ? (
        <span className="agent-chip-model-effort">{badge.effort}</span>
      ) : null}
    </>
  );
  if (onModelBadgeClick === undefined) {
    return (
      <span
        className="agent-chip-model"
        data-testid="agent-chip-model"
        title={badge.title}
      >
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="agent-chip-model interactive"
      data-testid="agent-chip-model"
      onClick={(event) => {
        event.stopPropagation();
        onModelBadgeClick(event);
      }}
      aria-label="Open runtime controls"
      title={badge.title}
    >
      {content}
    </button>
  );
}

function AccessBadge({
  accessPending,
  pendingAccessCount,
}: Pick<AgentChipProps, "accessPending" | "pendingAccessCount">): JSX.Element | null {
  if (accessPending !== true) return null;
  return (
    <span className="agent-chip-access" title="Access pending">
      {(pendingAccessCount ?? 0) > 1 ? pendingAccessCount : "!"}
    </span>
  );
}

function StateBadge({ state }: Pick<AgentChipProps, "state">): JSX.Element | null {
  if (state === PRESENCE_STATES.paneDead) {
    return (
      <span className="agent-chip-pill" data-testid="agent-chip-exited">
        exited
      </span>
    );
  }
  if (state !== PRESENCE_STATES.hookNotInstalled) return null;
  return (
    <span
      className="agent-chip-wrench"
      data-testid="agent-chip-wrench"
      aria-label="Hook not installed"
      title="Hook not installed"
    >
      {"\u{1F527}"}
    </span>
  );
}

export function AgentChip({
  participantId,
  name,
  runtimeId,
  state,
  color,
  active = false,
  accessPending = false,
  pendingAccessCount = 0,
  runtimeState,
  accessMode,
  activityState,
  expanded = false,
  onClick,
  onModelBadgeClick,
}: AgentChipProps): JSX.Element {
  const interactive = onClick !== undefined;
  const status = agentStatus(state, accessPending, activityState);
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!interactive) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onClick(event);
  };

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={`agent-chip${active ? " active" : ""}${expanded ? " expanded" : ""}`}
      data-participant-id={participantId}
      data-state={status}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-expanded={interactive ? expanded : undefined}
      aria-label={`${name} — ${accessPending ? "access pending" : state}`}
      style={agentChipStyle(color)}
    >
      <RuntimeIcon participantId={participantId} name={name} runtimeId={runtimeId} />
      <span className="agent-chip-name">{name}</span>
      <span
        className="agent-chip-dot-ring"
        style={statusDotStyle(runtimeState)}
        title={
          contextPercent(runtimeState) !== null
            ? `${contextPercent(runtimeState)}% context used`
            : "Context usage pending"
        }
      >
        <span className={`agent-chip-dot ${status}`} aria-hidden />
      </span>
      <ModelBadge
        runtimeState={runtimeState}
        onModelBadgeClick={onModelBadgeClick}
      />
      <AgentChipMetaIcons
        runtimeId={runtimeId}
        runtimeState={runtimeState}
        accessMode={accessMode}
      />
      <AccessBadge
        accessPending={accessPending}
        pendingAccessCount={pendingAccessCount}
      />
      <StateBadge state={state} />
    </div>
  );
}
