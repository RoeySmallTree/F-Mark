import { describe, expect, it, vi } from "vitest";
import type { AgentStatusRow } from "@f-mark/shared";
import { dispatchManagedAgentWsMessageToState } from "../../src/state/managedAgentWsDispatch.js";
import type { ManagedAgentWsDispatchState } from "../../src/state/managedAgentWsDispatch.js";

describe("dispatchManagedAgentWsMessageToState", () => {
  it("bumps live revision on agent lifecycle events but not presence", () => {
    const state = createMockDispatchState();

    dispatchManagedAgentWsMessageToState(state, {
      type: "presence",
      participant_id: "ag-1",
      state: "online",
      last_hook_at: 1,
    });
    expect(state.bumpManagedAgentLiveRevision).not.toHaveBeenCalled();

    dispatchManagedAgentWsMessageToState(state, {
      type: "managed-agent.spawned",
      participant_id: "ag-1",
      tmux_session: "tmux-1",
      runtime_id: "codex",
      active_session: "sess-1",
    });
    expect(state.bumpManagedAgentLiveRevision).toHaveBeenCalledTimes(1);

    dispatchManagedAgentWsMessageToState(state, {
      type: "managed-agent.killed",
      participant_id: "ag-1",
    });
    expect(state.bumpManagedAgentLiveRevision).toHaveBeenCalledTimes(2);

    dispatchManagedAgentWsMessageToState(state, {
      type: "managed-agent.updated",
      agent: statusRow({
        participant_id: "ag-1",
        display_name: "Codex",
        tmux_session: "tmux-1",
        runtime_id: "codex",
        active_session: "sess-1",
      }),
    });
    expect(state.bumpManagedAgentLiveRevision).toHaveBeenCalledTimes(3);
  });
});

function createMockDispatchState(): ManagedAgentWsDispatchState {
  return {
    presence: {},
    managedAgents: [],
    managedTerminals: [],
    envProbe: null,
    managedAgentLiveRevision: 0,
    participants: {},
    setPresence: vi.fn(),
    removePresence: vi.fn(),
    setManagedAgents: vi.fn(),
    setManagedTerminals: vi.fn(),
    addManagedAgent: vi.fn(),
    removeManagedAgent: vi.fn(),
    addManagedTerminal: vi.fn(),
    removeManagedTerminal: vi.fn(),
    setEnvProbe: vi.fn(),
    bumpManagedAgentLiveRevision: vi.fn(),
    upsertParticipant: vi.fn(),
  };
}

function statusRow(overrides: Partial<AgentStatusRow>): AgentStatusRow {
  return {
    participant_id: "ag-status",
    display_name: "Status Agent",
    runtime_id: "opencode",
    active_session: "sess-current",
    membership_session_id: "sess-current",
    membership_state: "active",
    pane_lifecycle: "live",
    controllable: true,
    runtime_session: null,
    managed: true,
    paused: false,
    connection_state: "connected",
    activity_state: "idle",
    tmux_session: "tmux-status",
    mcp_status: "unknown",
    hook_status: "unknown",
    context: {
      status: "unsupported",
      used_tokens: null,
      max_tokens: null,
      source: "unsupported",
    },
    access: {
      mode: "default",
      supported_modes: [],
      change_supported: false,
    },
    pending_access_count: 0,
    ...overrides,
  };
}
