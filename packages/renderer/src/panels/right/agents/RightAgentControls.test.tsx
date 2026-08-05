import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import type { AgentStatusRow } from "@f-mark/shared";
import { RightAgentControls } from "./RightAgentControls";
import { RightAgentViewModel } from "./agentPresentation";
import type { RightAgentsController } from "./types";

function statusRow(overrides: Partial<AgentStatusRow> = {}): AgentStatusRow {
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

function buildController(
  overrides: Partial<RightAgentsController> = {},
): RightAgentsController {
  return {
    agents: [],
    removedAgents: [],
    loading: false,
    error: null,
    busy: null,
    editing: null,
    pickingColorFor: null,
    runtimeOptions: {},
    runtimeOptionsLoading: {},
    participants: {},
    events: [],
    currentScope: null,
    setEditing: vi.fn(),
    setPickingColorFor: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    loadRuntimeOptions: vi.fn().mockResolvedValue(undefined),
    renameAgent: vi.fn().mockResolvedValue(undefined),
    recolorAgent: vi.fn().mockResolvedValue(undefined),
    setRuntimeModel: vi.fn().mockResolvedValue(undefined),
    setRuntimeEffort: vi.fn().mockResolvedValue(undefined),
    setAccessMode: vi.fn().mockResolvedValue(undefined),
    pauseOrResume: vi.fn().mockResolvedValue(undefined),
    interrupt: vi.fn().mockResolvedValue(undefined),
    compact: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    reconnect: vi.fn().mockResolvedValue(undefined),
    goodbye: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RightAgentControls goodbye", () => {
  it("does not end the agent when the human cancels", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const controller = buildController();
    const view = new RightAgentViewModel(statusRow(), {}, [], null, null, null);

    render(
      <RightAgentControls view={view} controller={controller} modalCtx={null} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /goodbye/i }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
    });
    expect(controller.goodbye).not.toHaveBeenCalled();
  });

  it("ends the agent when the human accepts", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const controller = buildController();
    const view = new RightAgentViewModel(statusRow(), {}, [], null, null, null);

    render(
      <RightAgentControls view={view} controller={controller} modalCtx={null} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /goodbye/i }));

    await waitFor(() => {
      expect(controller.goodbye).toHaveBeenCalledTimes(1);
    });
    const [agentArg, intentArg] = (controller.goodbye as ReturnType<typeof vi.fn>)
      .mock.calls[0] as [AgentStatusRow, { action: string }];
    expect(agentArg.participant_id).toBe("ag-status");
    expect(intentArg.action).toBe("agent.goodbye");
  });
});
