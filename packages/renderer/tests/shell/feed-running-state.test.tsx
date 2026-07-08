import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import type { AnyEventRecord, ManagedAgent } from "@f-mark/shared";
import { Feed } from "../../src/shell/Feed.js";
import { renderWithAgentSpawn as render } from "../agentSpawnProvider.js";
import { resetStore } from "../cards/_helpers.js";

const USER_TURN_END: AnyEventRecord = {
  filename: "20260616T100000Z_us-a7f3.turn-end.json",
  timestamp: "20260616T100000Z",
  participant_id: "us-a7f3",
  kind: "turn-end",
  payload: { participant_id: "us-a7f3" },
};

const RUNNING_AGENT: ManagedAgent = {
  participant_id: "ag-c92e",
  tmux_session: "fmark-ag-c92e",
  runtime_id: "claude",
  alive: true,
  activity_state: "running",
};

const NOTIFIED_AGENT: ManagedAgent = {
  ...RUNNING_AGENT,
  activity_state: "notified",
};

describe("Feed running-agent state", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ agents: [], removed_agents: [], capabilities: {} }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("running managed agents stay visible even when the latest turn boundary points to the user", () => {
    resetStore({
      events: [USER_TURN_END],
      managedAgents: [RUNNING_AGENT],
      presence: { "ag-c92e": { state: "online", last_hook_at: 1 } },
    });

    const { container } = render(<Feed />);

    expect(
      screen.getByRole("status", { name: /claude is thinking/i }),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".agent-chip-anchor.active-turn"),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /stop run/i }),
    ).toBeInTheDocument();
  });

  test("notified managed agents show as working while a user turn is unanswered", () => {
    resetStore({
      events: [USER_TURN_END],
      managedAgents: [NOTIFIED_AGENT],
      presence: { "ag-c92e": { state: "online", last_hook_at: 1 } },
    });

    const { container } = render(<Feed />);

    expect(
      screen.getByRole("status", { name: /claude is thinking/i }),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".agent-chip-anchor.active-turn"),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /stop run/i }),
    ).toBeInTheDocument();
  });
});
