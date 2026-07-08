import type { JSX } from "react";
import type { AgentSpawnRuntime } from "../../hooks/useAgentSpawn.js";
import type { AgentIdentity } from "./types.js";
import {
  ProvidersDisabledState,
  ProvidersStepView,
} from "./providers/ProvidersStepView.js";
import { useProviderSetupController } from "./providers/useProviderSetupController.js";

export interface ProvidersStepProps {
  token: string | null;
  runtimes: AgentSpawnRuntime[];
  disabledReason: string | null;
  chosenRuntimeId: string | null;
  modelForRuntime(runtimeId: string): string;
  effortForRuntime(runtimeId: string): string;
  onChoose(
    runtimeId: string,
    identity: AgentIdentity,
    defaults?: { model: string; effort: string },
  ): void;
}

export function ProvidersStep({
  token,
  runtimes,
  disabledReason,
  chosenRuntimeId,
  modelForRuntime,
  effortForRuntime,
  onChoose,
}: ProvidersStepProps): JSX.Element {
  const controller = useProviderSetupController({
    token,
    runtimes,
    disabledReason,
    chosenRuntimeId,
    modelForRuntime,
    effortForRuntime,
    onChoose,
  });

  if (disabledReason !== null) {
    return <ProvidersDisabledState disabledReason={disabledReason} />;
  }

  return (
    <ProvidersStepView
      runtimes={runtimes}
      chosenRuntimeId={chosenRuntimeId}
      scope={controller.scope}
      statuses={controller.statuses}
      onScopeChange={controller.setScope}
      onChoose={(runtimeId) => {
        const identity = controller.ensureIdentity(runtimeId);
        onChoose(runtimeId, identity, controller.defaultsForRuntime(runtimeId));
        return identity;
      }}
      onApply={controller.apply}
    />
  );
}
