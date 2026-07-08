import type { Dispatch, SetStateAction } from "react";
import type { SpawnResponse } from "@f-mark/shared";
import type { ManagedAgentsClient } from "../../api/managedAgents.js";
import type { RootScope } from "../../api/rootScope.js";
import {
  createAgentSpawnDraft,
  createConnectingAgent,
  type AgentSpawnDraft,
} from "./agentIdentity.js";
import { describeAgentSpawnFailure } from "./errors.js";
import { shouldLaunchFromPreflight } from "./preflight.js";
import { buildPreflightRequest, buildSpawnRequest } from "./requests.js";
import {
  removeConnectingAgent,
  upsertConnectingAgent,
} from "./state.js";
import type { AgentSpawnStoreBindings } from "./storeBindings.js";
import type {
  ConnectingAgent,
  IntegrationSetupState,
} from "./types.js";

export interface SpawnRuntimeJobInput
  extends Pick<
    AgentSpawnStoreBindings,
    "currentSessionId" | "setManagedAgentsDisabledReason"
  > {
  apiClient: ManagedAgentsClient;
  spawnRootScope: RootScope | null;
  setConnectingAgents: Dispatch<SetStateAction<ConnectingAgent[]>>;
  setIntegrationSetupFor: (state: IntegrationSetupState | null) => void;
  setSpawnError: (message: string | null) => void;
  accessModeForRuntime(runtimeId: string): string;
  modelForRuntime(runtimeId: string): string;
  effortForRuntime(runtimeId: string): string;
  onSpawnComplete(resp: SpawnResponse, name: string, color: string): void;
}

function removeConnecting(
  input: SpawnRuntimeJobInput,
  participantId: string | null,
): void {
  input.setConnectingAgents((prev) =>
    removeConnectingAgent(prev, participantId),
  );
}

function openIntegrationSetup(
  input: SpawnRuntimeJobInput,
  runtimeId: string,
  draft: AgentSpawnDraft,
  preflight: IntegrationSetupState["preflight"],
  model: string,
  effort: string,
): void {
  removeConnecting(input, draft.participantId);
  input.setIntegrationSetupFor({
    runtimeId,
    participantId: draft.participantId,
    preflight,
    suggestedName: draft.suggestedName,
    color: draft.color,
    rootScope: input.spawnRootScope,
    model,
    effort,
  });
}

function handleRuntimeSpawnFailure(
  input: SpawnRuntimeJobInput,
  participantId: string | null,
  error: unknown,
): void {
  removeConnecting(input, participantId);
  const failure = describeAgentSpawnFailure(error);
  if (failure.processApiDisabled) {
    input.setManagedAgentsDisabledReason(failure.message);
  }
  input.setSpawnError(failure.message);
  // eslint-disable-next-line no-console
  console.error("spawn failed", error);
}

export async function runSpawnRuntimeJob(
  runtimeId: string,
  input: SpawnRuntimeJobInput,
): Promise<void> {
  let participantId: string | null = null;
  try {
    const draft = createAgentSpawnDraft(runtimeId);
    participantId = draft.participantId;
    const accessMode = input.accessModeForRuntime(runtimeId);
    const model = input.modelForRuntime(runtimeId);
    const effort = input.effortForRuntime(runtimeId);
    input.setConnectingAgents((prev) =>
      upsertConnectingAgent(
        prev,
        createConnectingAgent(draft, runtimeId, input.currentSessionId),
      ),
    );
    const preflight = await input.apiClient.preflight(
      buildPreflightRequest(runtimeId, participantId, input.spawnRootScope),
    );
    if (!shouldLaunchFromPreflight(preflight)) {
      openIntegrationSetup(input, runtimeId, draft, preflight, model, effort);
      return;
    }
    const resp = await input.apiClient.spawn(
      buildSpawnRequest({
        runtimeId,
        sessionId: input.currentSessionId,
        rootScope: input.spawnRootScope,
        participantId,
        suggestedName: draft.suggestedName,
        accessMode,
        model,
        effort,
      }),
    );
    input.onSpawnComplete(resp, draft.suggestedName, draft.color);
    removeConnecting(input, participantId);
  } catch (error: unknown) {
    handleRuntimeSpawnFailure(input, participantId, error);
  }
}
