import { describe, expect, test } from "vitest";
import type { AgentStatusRow, ManagedAgent, Participant } from "@f-mark/shared";
import {
  buildAgentTerminals,
  managedAgentsFromStatusRows,
  resolveActiveAgentTerminal,
} from "../../src/panels/right/terminal/useAgentTerminalsController.js";

describe("buildAgentTerminals", () => {
  test("scopes tabs to the active session and keeps detached agents removable", () => {
    const agents: ManagedAgent[] = [
      managedAgent({
        participant_id: "ag-current-dead",
        display_name: "Tharix",
        active_session: "sess-current",
        tmux_session: "tmux-dead",
        alive: false,
      }),
      managedAgent({
        participant_id: "ag-other-session",
        display_name: "Old session",
        active_session: "sess-old",
        tmux_session: "tmux-old",
        alive: true,
      }),
      managedAgent({
        participant_id: "ag-current-live",
        active_session: "sess-current",
        tmux_session: "tmux-live",
        alive: true,
      }),
      managedAgent({
        participant_id: "ag-no-pane",
        active_session: "sess-current",
        tmux_session: null,
        alive: false,
      }),
    ];
    const participants: Record<string, Participant> = {
      "ag-current-live": participant("Codex Name", "sess-current"),
      "ag-other-session": participant("Old Name", "sess-old"),
    };

    expect(buildAgentTerminals(agents, participants, "sess-current")).toEqual([
      {
        participant_id: "ag-current-live",
        tmux_session: "tmux-live",
        label: "Codex Name",
        alive: true,
      },
      {
        participant_id: "ag-current-dead",
        tmux_session: "tmux-dead",
        label: "Tharix",
        alive: false,
      },
    ]);
  });

  test("falls back to participant active_session for older managed-agent rows", () => {
    const agents: ManagedAgent[] = [
      managedAgent({
        participant_id: "ag-legacy",
        tmux_session: "tmux-legacy",
        alive: true,
      }),
    ];
    const participants: Record<string, Participant> = {
      "ag-legacy": participant("Legacy Agent", "sess-current"),
    };

    expect(buildAgentTerminals(agents, participants, "sess-current")).toEqual([
      {
        participant_id: "ag-legacy",
        tmux_session: "tmux-legacy",
        label: "Legacy Agent",
        alive: true,
      },
    ]);
  });

  test("uses scoped status rows as alive terminal source", () => {
    const agents = managedAgentsFromStatusRows([
      statusRow({
        participant_id: "ag-opencode-live",
        display_name: "vornak",
        active_session: "sess-current",
        tmux_session: "tmux-live",
        connection_state: "connected",
      }),
      statusRow({
        participant_id: "ag-opencode-detached",
        display_name: "tharix",
        active_session: "sess-current",
        tmux_session: "tmux-detached",
        connection_state: "detached",
      }),
    ]);

    expect(buildAgentTerminals(agents, {}, "sess-current")).toEqual([
      {
        participant_id: "ag-opencode-detached",
        tmux_session: "tmux-detached",
        label: "tharix",
        alive: false,
      },
      {
        participant_id: "ag-opencode-live",
        tmux_session: "tmux-live",
        label: "vornak",
        alive: true,
      },
    ]);
  });

  test("defaults the active terminal to a live agent when detached tabs sort first", () => {
    expect(
      resolveActiveAgentTerminal(null, [
        {
          participant_id: "ag-detached",
          tmux_session: "tmux-detached",
          label: "tharix",
          alive: false,
        },
        {
          participant_id: "ag-live",
          tmux_session: "tmux-live",
          label: "vornak",
          alive: true,
        },
      ]),
    ).toBe("tmux-live");
  });
});

function managedAgent(overrides: Partial<ManagedAgent>): ManagedAgent {
  return {
    participant_id: "ag-test",
    tmux_session: "tmux-test",
    runtime_id: "codex",
    ...overrides,
  };
}

function participant(name: string, activeSession: string): Participant {
  return {
    kind: "agent",
    name,
    color: "#4c7bd9",
    active_session: activeSession,
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
    activity_state: "notified",
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
