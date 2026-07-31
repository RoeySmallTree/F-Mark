import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const goodbye = vi.fn();
const getConfirmToken = vi.fn();

vi.mock("../../../api/managedAgents.js", () => ({
  createManagedAgentsClient: () => ({
    goodbye,
    getConfirmToken,
    status: vi.fn().mockResolvedValue({ agents: [] }),
  }),
}));

vi.mock("../../../hooks/useCurrentSessionRootScope.js", () => ({
  useCurrentSessionRootScopeBinding: () => ({ scope: null, scopeKey: "test" }),
}));

import { useAgentTerminalsController } from "./useAgentTerminalsController";
import { useStore } from "../../../state/store";

const AGENT = {
  tmux_session: "fmark-test",
  participant_id: "ag-test",
  label: "Test",
  alive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    currentSessionId: "session-1",
    managedAgents: [
      {
        participant_id: AGENT.participant_id,
        display_name: AGENT.label,
        tmux_session: AGENT.tmux_session,
        active_session: "session-1",
        alive: true,
      },
    ],
  } as never);
});

describe("agent terminal close", () => {
  it("never ends the agent", () => {
    const { result } = renderHook(() => useAgentTerminalsController());
    act(() => {
      result.current.close(AGENT);
    });
    expect(goodbye).not.toHaveBeenCalled();
    expect(getConfirmToken).not.toHaveBeenCalled();
  });

  it("unmounts the terminal view", () => {
    const { result } = renderHook(() => useAgentTerminalsController());
    act(() => {
      result.current.select(AGENT.tmux_session);
    });
    act(() => {
      result.current.close(AGENT);
    });
    expect(result.current.mountedSessions).not.toContain(AGENT.tmux_session);
  });
});
