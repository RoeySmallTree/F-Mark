import type { JSX } from "react";
import type { AgentSpawnRuntime } from "../../../hooks/useAgentSpawn.js";
import type { AgentIdentity } from "../types.js";
import { ProviderRow } from "./ProviderRow.js";
import { ScopeToggle } from "./ScopeToggle.js";
import {
  EMPTY_RUNTIME_STATUS,
  type RuntimeStatus,
  type Scope,
} from "./types.js";

export function ProvidersDisabledState({
  disabledReason,
}: {
  disabledReason: string;
}): JSX.Element {
  return (
    <div className="ob-providers">
      <div className="form-error" role="alert">
        {disabledReason}
      </div>
      <p className="ob-hint">
        You can still finish onboarding — set up providers later from the
        top-bar <b>+</b> menu.
      </p>
    </div>
  );
}

export function ProvidersStepView({
  runtimes,
  chosenRuntimeId,
  scope,
  statuses,
  onScopeChange,
  onChoose,
  onApply,
}: {
  runtimes: AgentSpawnRuntime[];
  chosenRuntimeId: string | null;
  scope: Scope;
  statuses: Record<string, RuntimeStatus>;
  onScopeChange(scope: Scope): void;
  onChoose(runtimeId: string): AgentIdentity;
  onApply(runtimeId: string): Promise<void>;
}): JSX.Element {
  return (
    <div className="ob-providers">
      <div className="ob-providers-head">
        <span className="ob-hint">
          Install the F-Mark MCP server + hooks for the agents you use. Nothing
          launches yet.
        </span>
        <ScopeToggle
          runtimeId={chosenRuntimeId}
          scope={scope}
          onScopeChange={onScopeChange}
        />
      </div>

      <div className="ob-provider-list">
        {runtimes.map((runtime) => (
          <ProviderRow
            key={runtime.id}
            runtime={runtime}
            status={statuses[runtime.id] ?? EMPTY_RUNTIME_STATUS}
            chosen={chosenRuntimeId === runtime.id}
            onChoose={onChoose}
            onApply={onApply}
          />
        ))}
      </div>
    </div>
  );
}
