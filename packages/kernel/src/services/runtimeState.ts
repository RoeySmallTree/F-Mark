import type { CurrentRuntimeState } from "@f-mark/shared";

/* In-memory store for per-participant runtime state. Populated by the
   POST /managed-agents/:id/runtime-state route (called by the autoStream
   hook on Stop/PostToolUse) and consumed by buildStatusRows so the
   resulting AgentStatusRow can carry runtime_state on the WS bus. */

const store = new Map<string, CurrentRuntimeState>();

function runtimeStateKey(participantId: string, pathId?: string | null): string {
  return pathId !== undefined && pathId !== null && pathId.length > 0
    ? `${pathId}/${participantId}`
    : participantId;
}

export function setRuntimeState(
  participantId: string,
  state: CurrentRuntimeState,
  pathId?: string | null,
): void {
  store.set(runtimeStateKey(participantId, pathId), state);
}

export function getRuntimeState(
  participantId: string,
  pathId?: string | null,
): CurrentRuntimeState | undefined {
  return store.get(runtimeStateKey(participantId, pathId)) ?? store.get(participantId);
}

function clearRuntimeState(participantId: string, pathId?: string | null): void {
  store.delete(runtimeStateKey(participantId, pathId));
}

/* Test-only: reset the entire store between test runs. */
function resetRuntimeStateStore(): void {
  store.clear();
}
