import { describe, expect, test } from "vitest";
import type { AgentStatusRow } from "@f-mark/shared";
import {
  managedAgentFromStatusRow,
  presenceFromStatusRow,
} from "../../src/components/participantStrip/scopedAgentStatusSync.js";

describe("scoped participant strip agent status sync", () => {
  test("maps connected scoped status to alive managed row and online presence", () => {
    const row = statusRow({
      participant_id: "ag-opencode-5822",
      display_name: "vornak",
      tmux_session: "fmark-cabal-ag-opencode-5822",
      connection_state: "connected",
      activity_state: "notified",
    });

    expect(managedAgentFromStatusRow(row)).toMatchObject({
      participant_id: "ag-opencode-5822",
      display_name: "vornak",
      tmux_session: "fmark-cabal-ag-opencode-5822",
      alive: true,
      activity_state: "notified",
    });
    expect(presenceFromStatusRow(row)).toEqual({
      state: "online",
      last_hook_at: null,
    });
  });

  test("keeps detached scoped status offline for chips", () => {
    const row = statusRow({
      participant_id: "ag-opencode-57d4",
      connection_state: "detached",
      tmux_session: "fmark-cabal-ag-opencode-57d4",
    });

    expect(managedAgentFromStatusRow(row)).toMatchObject({
      participant_id: "ag-opencode-57d4",
      alive: false,
    });
    expect(presenceFromStatusRow(row).state).toBe("offline");
  });
});

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
