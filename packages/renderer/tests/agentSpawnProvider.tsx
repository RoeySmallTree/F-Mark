import {
  render,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react";
import {
  useCallback,
  useMemo,
  type JSX,
  type ReactElement,
  type ReactNode,
} from "react";
import { createManagedAgentsClient } from "../src/api/managedAgents.js";
import {
  AgentSpawnProvider,
  useAgentSpawn,
} from "../src/hooks/useAgentSpawn.js";
import { IntegrationSetupModal } from "../src/modals/IntegrationSetupModal.js";
import { useStore } from "../src/state/store.js";

function AgentSpawnTestProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const agentSpawn = useAgentSpawn();
  const token = useStore((s) => s.token);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const apiClient = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );
  const closeIntegrationSetup = useCallback(
    () => agentSpawn.setIntegrationSetupFor(null),
    [agentSpawn],
  );
  return (
    <AgentSpawnProvider value={agentSpawn}>
      {children}
      {agentSpawn.integrationSetupFor !== null ? (
        <IntegrationSetupModal
          runtimeId={agentSpawn.integrationSetupFor.runtimeId}
          participantId={agentSpawn.integrationSetupFor.participantId}
          sessionId={currentSessionId ?? undefined}
          suggestedName={agentSpawn.integrationSetupFor.suggestedName}
          accessMode={agentSpawn.accessModeForRuntime(
            agentSpawn.integrationSetupFor.runtimeId,
          )}
          accessModeOptions={agentSpawn.accessModeOptionsForRuntime(
            agentSpawn.integrationSetupFor.runtimeId,
          )}
          onAccessModeChange={(mode) =>
            agentSpawn.setAccessModeForRuntime(
              agentSpawn.integrationSetupFor!.runtimeId,
              mode,
            )
          }
          initialPreflight={agentSpawn.integrationSetupFor.preflight}
          apiClient={apiClient}
          onClose={closeIntegrationSetup}
          onLaunched={(resp) => {
            const setup = agentSpawn.integrationSetupFor;
            if (setup === null) return;
            const { suggestedName, color } = setup;
            agentSpawn.setIntegrationSetupFor(null);
            agentSpawn.onSpawnComplete(resp, suggestedName, color);
          }}
        />
      ) : null}
    </AgentSpawnProvider>
  );
}

export function renderWithAgentSpawn(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
): RenderResult {
  return render(ui, { ...options, wrapper: AgentSpawnTestProvider });
}
