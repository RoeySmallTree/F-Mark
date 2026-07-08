import type { CSSProperties } from "react";
import { runtimeAccessModeLabel } from "@f-mark/shared";
import { Zap } from "lucide-react";
import { AccessRequestCard } from "../../../cards/AccessRequestCard.js";
import {
  contextFallback,
  contextPercent,
  contextPercentValue,
  effortLabel,
  formatContextTokens,
  modelLabel,
  sourceLabel,
  type RightAgentViewModel,
} from "./agentPresentation.js";
import type { RightAgentsController } from "./types.js";

interface RightAgentDetailsProps {
  view: RightAgentViewModel;
  controller: RightAgentsController;
}

export function RightAgentDetails({
  view,
  controller,
}: RightAgentDetailsProps): JSX.Element {
  return (
    <>
      <AgentMetrics view={view} />
      <div className="agent-detail-sections">
        <RuntimeSection view={view} controller={controller} />
        <PermissionsSection view={view} controller={controller} />
        <ContextSection view={view} controller={controller} />
      </div>
      {view.pendingRequests.length > 0 ? (
        <div className="agent-access-requests">
          {view.pendingRequests.map((request) => (
            <AccessRequestCard
              key={request.filename}
              event={request}
              participants={controller.participants}
              allEvents={controller.events}
              compact
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function AgentMetrics({ view }: { view: RightAgentViewModel }): JSX.Element {
  const { agent } = view;
  return (
    <div className="agent-metrics">
      <div>
        <span>Context used</span>
        <b>{formatContextTokens(agent, agent.context.used_tokens)}</b>
      </div>
      <div>
        <span>Available</span>
        <b>{formatContextTokens(agent, agent.context.max_tokens)}</b>
      </div>
      <div>
        <span>Model</span>
        <b>{modelLabel(agent)}</b>
      </div>
      <div>
        <span>Effort</span>
        <b>{effortLabel(agent)}</b>
      </div>
    </div>
  );
}

function RuntimeSection({
  view,
  controller,
}: RightAgentDetailsProps): JSX.Element {
  const { agent } = view;
  const options = controller.runtimeOptions[agent.participant_id];
  const modelValue = agent.runtime_state?.configuredModel ?? agent.runtime_state?.model ?? "";
  const effortValue =
    agent.runtime_state?.configuredEffort ?? agent.runtime_state?.effort ?? "";
  const modelOptions = options?.models ?? [];
  const effortOptions = options?.efforts ?? [];
  return (
    <section className="agent-detail-section">
      <div className="agent-section-head">
        <h4>Runtime</h4>
        <span>{sourceLabel(agent)}</span>
      </div>
      <label className="agent-field">
        <span>Model</span>
        <select
          value={modelValue}
          disabled={view.isBusy}
          onChange={(event) => {
            void controller.setRuntimeModel(agent, event.currentTarget.value);
          }}
        >
          {modelValue === "" ? (
            <option value="">Provider default</option>
          ) : modelOptions.every((model) => model.id !== modelValue) ? (
            <option value={modelValue}>{modelLabel(agent)}</option>
          ) : null}
          {modelOptions.map((model) => (
            <option key={model.id} value={model.id}>
              {model.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className="agent-field">
        <span>Effort</span>
        <select
          value={effortValue}
          disabled={view.isBusy}
          onChange={(event) => {
            void controller.setRuntimeEffort(agent, event.currentTarget.value);
          }}
        >
          {effortValue === "" ? (
            <option value="">Provider default</option>
          ) : effortOptions.every((effort) => effort.id !== effortValue) ? (
            <option value={effortValue}>{effortLabel(agent)}</option>
          ) : null}
          {effortOptions.map((effort) => (
            <option key={effort.id} value={effort.id}>
              {effort.displayName}
            </option>
          ))}
        </select>
      </label>
      {configuredModelMismatch(agent) ? (
        <p>Configured model differs from the last observed live model.</p>
      ) : null}
    </section>
  );
}

function PermissionsSection({
  view,
  controller,
}: RightAgentDetailsProps): JSX.Element {
  const { agent } = view;
  const canChange = agent.access.supported_modes.length > 0;
  return (
    <section className="agent-detail-section">
      <div className="agent-section-head">
        <h4>Permissions</h4>
        <span>{runtimeAccessModeLabel(agent.runtime_id, agent.access.mode)}</span>
      </div>
      {canChange ? (
        <label className="agent-field">
          <span>Mode</span>
          <select
            value={agent.access.mode}
            disabled={view.isBusy}
            title={agent.access.reason}
            onChange={(event) => {
              void controller.setAccessMode(agent, event.currentTarget.value);
            }}
          >
            {agent.access.supported_modes.map((mode) => (
              <option key={mode} value={mode}>
                {runtimeAccessModeLabel(agent.runtime_id, mode)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="agent-readonly-field">
          {runtimeAccessModeLabel(agent.runtime_id, agent.access.mode)}
        </div>
      )}
      <p>{agent.access.reason ?? "Permission mode is saved for this agent."}</p>
    </section>
  );
}

function ContextSection({
  view,
  controller,
}: RightAgentDetailsProps): JSX.Element {
  const { agent } = view;
  const percent = contextPercentValue(agent);
  return (
    <section className="agent-detail-section">
      <div className="agent-section-head">
        <h4>Context</h4>
        <span>{contextPercent(agent) ?? agent.context.source}</span>
      </div>
      <div
        className="agent-context-meter"
        style={
          percent !== null
            ? ({ "--context-used": `${percent}%` } as CSSProperties)
            : undefined
        }
      >
        <span />
      </div>
      <div className="agent-context-row">
        <p>{contextFallback(agent)}</p>
        <button
          type="button"
          title="Compact this agent's context"
          aria-label={`Compact ${agent.display_name} context`}
          disabled={view.isBusy || view.compactDisabled}
          onClick={() => void controller.compact(agent)}
        >
          <Zap size={13} aria-hidden="true" />
          Compact
        </button>
      </div>
    </section>
  );
}

function configuredModelMismatch(agent: RightAgentViewModel["agent"]): boolean {
  return (
    agent.runtime_state?.configuredModel !== undefined &&
    agent.runtime_state.model !== undefined &&
    agent.runtime_state.configuredModel !== agent.runtime_state.model
  );
}
