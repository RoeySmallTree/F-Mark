import type { CurrentRuntimeState } from "@f-mark/shared";

/* In-memory store for per-participant runtime state. Populated by the
   POST /managed-agents/:id/runtime-state route (called by the autoStream
   hook on Stop/PostToolUse) and consumed by buildStatusRows so the
   resulting AgentStatusRow can carry runtime_state on the WS bus. */

const store = new Map<string, CurrentRuntimeState>();

export function setRuntimeState(participantId: string, state: CurrentRuntimeState): void {
  store.set(participantId, state);
}

export function getRuntimeState(participantId: string): CurrentRuntimeState | undefined {
  return store.get(participantId);
}

export function clearRuntimeState(participantId: string): void {
  store.delete(participantId);
}

/* Test-only: reset the entire store between test runs. */
export function resetRuntimeStateStore(): void {
  store.clear();
}
