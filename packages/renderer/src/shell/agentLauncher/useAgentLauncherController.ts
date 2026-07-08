import { isOfferableRuntimeId } from "@f-mark/shared";
import { useAgentSpawnContext } from "../../hooks/useAgentSpawn.js";
import { useStore } from "../../state/store.js";
import { buildProviderCardModel } from "./model.js";
import type { AgentLauncherController } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  runtimes: "runtimes",
} as const;

export function useAgentLauncherController(): AgentLauncherController {
  const spawn = useAgentSpawnContext();
  const openSettings = useStore((s) => s.openSettings);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const connectingRuntimeIds = new Set(
    spawn.connectingAgents
      .filter((agent) => agent.sessionId === currentSessionId)
      .map((agent) => agent.runtimeId),
  );
  const runtimes = spawn.runtimes
    .filter((runtime) => isOfferableRuntimeId(runtime.id))
    .map((runtime) =>
      buildProviderCardModel({
        runtime,
        accessMode: spawn.accessModeForRuntime(runtime.id),
        accessModeOptions: spawn.accessModeOptionsForRuntime(runtime.id),
        model: spawn.modelForRuntime(runtime.id),
        effort: spawn.effortForRuntime(runtime.id),
        modelOptions: spawn.modelOptionsForRuntime(runtime.id),
        effortOptions: spawn.effortOptionsForRuntime(runtime.id),
        connecting: connectingRuntimeIds.has(runtime.id),
      }),
    );

  return {
    runtimes,
    disabled:
      spawn.spawnDisabledReason !== null || connectingRuntimeIds.size > 0,
    spawnError: spawn.spawnError,
    onManageRuntimes: spawn.onManageRuntimes,
    onOpenRuntimeSettings: () => openSettings(NO_LOOSE_STRING_VALUES.runtimes),
    onSpawnRuntime: spawn.onSpawnRuntime,
    onConfigureRuntime: spawn.onConfigureRuntime,
    onAccessModeChange: spawn.setAccessModeForRuntime,
    onModelChange: spawn.setModelForRuntime,
    onEffortChange: spawn.setEffortForRuntime,
  };
}
