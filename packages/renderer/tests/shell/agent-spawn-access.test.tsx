import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { MockInstance } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentLauncher } from "../../src/shell/AgentLauncher.js";
import { useStore } from "../../src/state/store.js";
import { renderWithAgentSpawn } from "../agentSpawnProvider.js";

describe("agent spawn access mode", () => {
  let fetchSpy: MockInstance<typeof fetch>;
  let spawnBody: Record<string, unknown> | null;

  beforeEach(() => {
    globalThis.localStorage?.clear();
    spawnBody = null;
    useStore.setState({
      token: null,
      currentSessionId: "sess-access",
      envProbe: {
        tmux: true,
        tmuxVersion: "3.4",
        runtimes: { claude: true, codex: true, opencode: true },
        installer: "apt",
        os: "linux",
      },
      managedAgentsDisabledReason: null,
      participants: {
        "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      },
      currentUserId: "us-a7f3",
    });
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes("/runtimes/") && url.endsWith("/models")) {
          return json({
            models: [{ id: "provider-model", displayName: "Provider model" }],
            default_model: "provider-model",
            default_effort: "high",
            default_access_mode: url.includes("/codex/") ? "never" : "default",
          });
        }
        if (url.includes("/runtimes/") && url.includes("/efforts")) {
          return json({
            efforts: [{ id: "high", displayName: "High" }],
          });
        }
        if (url.endsWith("/managed-agents/preflight")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            runtime_id?: string;
          };
          return json({
            runtime: {
              runtime_id: body.runtime_id ?? "codex",
              executable: body.runtime_id ?? "codex",
              available: true,
            },
            mcp: {
              status: "installed",
              locations: [
                {
                  scope: "project",
                  path: "/tmp/project-config",
                  status: "installed",
                  safe_auto_apply: true,
                },
              ],
            },
            hooks: {
              status: "installed",
              locations: [
                {
                  scope: "project",
                  path: "/tmp/project-hooks",
                  status: "installed",
                  safe_auto_apply: true,
                },
              ],
            },
            chosen_scope: "user",
            can_apply: true,
          });
        }
        if (url.endsWith("/managed-agents/spawn")) {
          spawnBody = JSON.parse(String(init?.body ?? "{}")) as Record<
            string,
            unknown
          >;
          return json({
            participant_id: "ag-codex-access",
            tmux_session: "fmark-ag-codex-access",
            runtime_id: "codex",
            active_session: "sess-access",
            hooks_status: "installed",
          });
        }
        return json({});
      });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    cleanup();
    globalThis.localStorage?.clear();
  });

  test("selected mode is remembered and sent in the spawn payload", async () => {
    const user = userEvent.setup();
    renderWithAgentSpawn(<AgentLauncher />);

    const card = screen.getByText("Codex").closest(".agent-launcher-card");
    expect(card).not.toBeNull();
    await user.selectOptions(
      within(card as HTMLElement).getByLabelText("Codex permission mode"),
      "never",
    );

    await user.click(
      within(card as HTMLElement).getByRole("button", { name: /connect/i }),
    );

    await waitFor(() => {
      expect(spawnBody).toMatchObject({
        runtime_id: "codex",
        access_mode: "never",
      });
    });
  });

  test("opencode exposes its skip-permissions launch option", async () => {
    const user = userEvent.setup();
    renderWithAgentSpawn(<AgentLauncher />);

    const card = screen.getByText("Opencode").closest(".agent-launcher-card");
    expect(card).not.toBeNull();
    const select = within(card as HTMLElement).getByLabelText(
      "Opencode permission mode",
    );
    expect(
      within(select as HTMLElement).getByRole("option", {
        name: "Skip permissions",
      }),
    ).toBeInTheDocument();

    await user.selectOptions(select, "dangerously-skip-permissions");
    await user.click(
      within(card as HTMLElement).getByRole("button", { name: /connect/i }),
    );

    await waitFor(() => {
      expect(spawnBody).toMatchObject({
        runtime_id: "opencode",
        access_mode: "dangerously-skip-permissions",
      });
    });
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
