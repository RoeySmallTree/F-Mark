/* useAgentSpawn — single owner for the renderer's agent-spawn UX.

   Lifted here from TopBar so multiple surfaces (the topbar `+` menu and the
   empty-session AgentLauncher) share the same preflight + IntegrationSetup
   modal state. App.tsx calls this hook once and provides the result via
   AgentSpawnContext; consumers read it with useAgentSpawnContext(). */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { createManagedAgentsClient } from "../api/managedAgents.js";
import { createClient } from "../api/client.js";
import { useAgentAccessModes } from "./useAgentSpawn/accessModes.js";
import { useAgentRuntimeCatalog } from "./useAgentSpawn/runtimeCatalog.js";
import {
  buildAgentSpawnRuntimes,
  extractProbeRuntimes,
  isTmuxMissing,
} from "./useAgentSpawn/runtimeModel.js";
import { useAgentSpawnActions } from "./useAgentSpawn/useAgentSpawnActions.js";
import { useAgentSpawnStoreBindings } from "./useAgentSpawn/storeBindings.js";
import type {
  AgentSpawnValue,
  ConnectingAgent,
  IntegrationSetupState,
} from "./useAgentSpawn/types.js";
export type {
  AgentSpawnRuntime,
  AgentSpawnValue,
  ConnectingAgent,
  IntegrationSetupState,
} from "./useAgentSpawn/types.js";

export function useAgentSpawn(): AgentSpawnValue {
  const {
    token,
    envProbe,
    currentSessionId,
    managedAgentsDisabledReason,
    setManagedAgentsDisabledReason,
    addManagedAgent,
    upsertParticipant,
    setPresence,
    openSettings,
    spawnRootScope,
  } = useAgentSpawnStoreBindings();

  const [integrationSetupFor, setIntegrationSetupFor] =
    useState<IntegrationSetupState | null>(null);
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const [connectingAgents, setConnectingAgents] = useState<ConnectingAgent[]>(
    [],
  );

  const apiClient = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );
  const restClient = useMemo(() => createClient({ baseUrl: "", token }), [token]);

  const probeRuntimes = useMemo(() => extractProbeRuntimes(envProbe), [envProbe]);
  const runtimes = useMemo(
    () => buildAgentSpawnRuntimes(probeRuntimes),
    [probeRuntimes],
  );
  const runtimeIds = useMemo(
    () => runtimes.map((runtime) => runtime.id),
    [runtimes],
  );
  const {
    modelForRuntime,
    effortForRuntime,
    modelOptionsForRuntime,
    effortOptionsForRuntime,
    defaultAccessModeForRuntime,
    setModelForRuntime,
    setEffortForRuntime,
  } = useAgentRuntimeCatalog(apiClient, runtimeIds);
  const {
    accessModeForRuntime,
    accessModeOptionsForRuntime,
    setAccessModeForRuntime,
  } = useAgentAccessModes(defaultAccessModeForRuntime);
  const tmuxMissing = isTmuxMissing(envProbe);
  const spawnDisabledReason = managedAgentsDisabledReason;
  const {
    onSpawnRuntime,
    onConfigureRuntime,
    onManageRuntimes,
    onSpawnComplete,
  } = useAgentSpawnActions({
    apiClient,
    restClient,
    currentSessionId,
    managedAgentsDisabledReason,
    setManagedAgentsDisabledReason,
    addManagedAgent,
    upsertParticipant,
    setPresence,
    openSettings,
    spawnRootScope,
    setConnectingAgents,
    setIntegrationSetupFor,
    setSpawnError,
    accessModeForRuntime,
    modelForRuntime,
    effortForRuntime,
  });

  return {
    runtimes,
    tmuxMissing,
    spawnDisabledReason,
    spawnError,
    connectingAgents,
    integrationSetupFor,
    setIntegrationSetupFor,
    setSpawnError,
    accessModeForRuntime,
    accessModeOptionsForRuntime,
    setAccessModeForRuntime,
    modelForRuntime,
    effortForRuntime,
    modelOptionsForRuntime,
    effortOptionsForRuntime,
    setModelForRuntime,
    setEffortForRuntime,
    onSpawnRuntime,
    onConfigureRuntime,
    onManageRuntimes,
    onSpawnComplete,
  };
}

const AgentSpawnContext = createContext<AgentSpawnValue | null>(null);

export function AgentSpawnProvider({
  value,
  children,
}: {
  value: AgentSpawnValue;
  children: ReactNode;
}): JSX.Element {
  return (
    <AgentSpawnContext.Provider value={value}>{children}</AgentSpawnContext.Provider>
  );
}

export function useAgentSpawnContext(): AgentSpawnValue {
  const ctx = useContext(AgentSpawnContext);
  if (ctx === null) {
    throw new Error(
      "useAgentSpawnContext must be called inside <AgentSpawnProvider>",
    );
  }
  return ctx;
}

export function useOptionalAgentSpawnContext(): AgentSpawnValue | null {
  return useContext(AgentSpawnContext);
}
