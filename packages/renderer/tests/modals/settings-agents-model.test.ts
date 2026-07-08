import type { AgentStatusRow } from "@f-mark/shared";
import { describe, expect, test } from "vitest";
import {
  buildPathAgentGroups,
  collectPathScopes,
  isConnectedAgent,
  type ConnectedAgentEntry,
} from "../../src/modals/settings/agents/model.js";

function agent(
  overrides: Partial<AgentStatusRow> & Pick<AgentStatusRow, "participant_id">,
): AgentStatusRow {
  return {
    display_name: overrides.participant_id,
    runtime_id: "claude",
    active_session: "session-a",
    membership_session_id: "session-a",
    membership_state: "active",
    pane_lifecycle: "live",
    controllable: true,
    runtime_session: null,
    managed: true,
    paused: false,
    connection_state: "connected",
    activity_state: "running",
    tmux_session: "fmark-ag-1",
    mcp_status: "installed",
    hook_status: "installed",
    context: {
      status: "reported",
      used_tokens: null,
      max_tokens: null,
      source: "not-reported",
    },
    access: {
      mode: "default",
      supported_modes: ["default"],
      change_supported: false,
    },
    pending_access_count: 0,
    ...overrides,
  };
}

describe("settings agents model", () => {
  test("isConnectedAgent only accepts live connected agents", () => {
    expect(isConnectedAgent(agent({ participant_id: "ag-1" }))).toBe(true);
    expect(
      isConnectedAgent(
        agent({ participant_id: "ag-2", connection_state: "offline" }),
      ),
    ).toBe(false);
    expect(
      isConnectedAgent(
        agent({ participant_id: "ag-3", connection_state: "detached" }),
      ),
    ).toBe(false);
  });

  test("collectPathScopes dedupes paths from sessions", () => {
    const scopes = collectPathScopes(
      [
        {
          id: "s1",
          slug: "alpha",
          created_at: "2026-01-01T00:00:00.000Z",
          path: "/repo/a",
          path_id: "a-id",
        },
        {
          id: "s2",
          slug: "beta",
          created_at: "2026-01-02T00:00:00.000Z",
          path: "/repo/a",
          path_id: "a-id",
        },
        {
          id: "s3",
          slug: "gamma",
          created_at: "2026-01-03T00:00:00.000Z",
          path: "/repo/b",
          path_id: "b-id",
        },
      ],
    );
    expect(scopes).toHaveLength(2);
    expect(scopes.map((scope) => scope.pathKey)).toEqual([
      "path_id:a-id",
      "path_id:b-id",
    ]);
  });

  test("buildPathAgentGroups groups by path then session", () => {
    const entries: ConnectedAgentEntry[] = [
      {
        agent: agent({
          participant_id: "ag-1",
          display_name: "Claude",
          active_session: "session-a",
        }),
        scope: { pathId: "a-id" },
        path: "/repo/a",
        pathId: "a-id",
      },
      {
        agent: agent({
          participant_id: "ag-2",
          display_name: "Codex",
          active_session: "session-b",
        }),
        scope: { pathId: "b-id" },
        path: "/repo/b",
        pathId: "b-id",
      },
    ];
    const groups = buildPathAgentGroups(entries, [
      {
        id: "session-a",
        slug: "alpha",
        created_at: "2026-01-01T00:00:00.000Z",
        path: "/repo/a",
        path_id: "a-id",
      },
      {
        id: "session-b",
        slug: "beta",
        created_at: "2026-01-02T00:00:00.000Z",
        path: "/repo/b",
        path_id: "b-id",
      },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.label).toBe("a");
    expect(groups[0]?.sessions[0]?.sessionSlug).toBe("alpha");
    expect(groups[0]?.sessions[0]?.agents[0]?.agent.participant_id).toBe("ag-1");
    expect(groups[1]?.label).toBe("b");
    expect(groups[1]?.sessions[0]?.sessionSlug).toBe("beta");
  });
});
