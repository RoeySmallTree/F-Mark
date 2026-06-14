import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { MockInstance } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RightAgents } from "../../src/panels/right/RightAgents.js";
import { useStore } from "../../src/state/store.js";

describe("RightAgents permissions and context", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    useStore.setState({
      token: null,
      currentSessionId: "sess-agents",
      participants: {
        "ag-codex-access": {
          kind: "agent",
          name: "Codex",
          color: "#1f7ab8",
          active_session: "sess-agents",
          runtime_id: "codex",
        },
      },
      managedAgents: [
        {
          participant_id: "ag-codex-access",
          tmux_session: "fmark-ag-codex-access",
          runtime_id: "codex",
        },
      ],
      events: [],
    });
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.startsWith("/managed-agents/status")) {
          return json({
            agents: [
              {
                participant_id: "ag-codex-access",
                display_name: "Codex",
                runtime_id: "codex",
                active_session: "sess-agents",
                runtime_session: null,
                managed: true,
                paused: false,
                connection_state: "connected",
                activity_state: "idle",
                tmux_session: "fmark-ag-codex-access",
                mcp_status: "installed",
                hook_status: "installed",
                context: {
                  status: "not-reported",
                  used_tokens: null,
                  max_tokens: null,
                  source: "not-reported",
                  reason:
                    "Codex context usage requires app-server token-usage events.",
                },
                access: {
                  mode: "never",
                  supported_modes: [
                    "default",
                    "untrusted",
                    "on-request",
                    "never",
                  ],
                  change_supported: false,
                  reason:
                    "Codex approval policy is a launch flag; live changes are not verified.",
                },
                pending_access_count: 0,
              },
            ],
            capabilities: {},
          });
        }
        if (url.includes("/runtime/models")) return json({ models: [] });
        if (url.includes("/runtime/efforts")) return json({ efforts: [] });
        return json({});
      });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    cleanup();
  });

  test("unsupported live permission changes render as read-only with a reason", async () => {
    const user = userEvent.setup();
    render(<RightAgents />);

    const summary = await screen.findByText("Codex");
    await user.click(summary.closest("summary") as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText("Never ask")).toBeInTheDocument();
    });
    const permissions = screen.getByText("Permissions").closest("section");
    expect(permissions).not.toBeNull();
    expect(
      within(permissions as HTMLElement).queryByRole("combobox", {
        name: /mode/i,
      }),
    ).toBeNull();
    expect(
      within(permissions as HTMLElement).getByText(/launch flag/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/app-server token-usage events/i),
    ).toBeInTheDocument();
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
