import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { IntegrationPreflightResponse, SpawnResponse } from "@f-mark/shared";
import {
  IntegrationSetupModal,
  type IntegrationSetupModalProps,
} from "../../src/modals/IntegrationSetupModal.js";
import type { ManagedAgentsClient } from "../../src/api/managedAgents.js";

const PREFLIGHT: IntegrationPreflightResponse = {
  runtime: {
    runtime_id: "claude",
    executable: "claude",
    available: true,
    version: "1.2.3",
  },
  mcp: {
    status: "installed",
    expected_version: "phase5-stdio-v1",
    locations: [
      {
        scope: "user",
        path: "/home/roey/.claude.json",
        status: "installed",
        safe_auto_apply: true,
        version: "phase5-stdio-v1",
      },
      {
        scope: "project",
        path: "/repo/.mcp.json",
        status: "stale",
        safe_auto_apply: true,
        version: "phase4-stdio-v1",
      },
    ],
  },
  hooks: {
    status: "missing",
    locations: [
      {
        scope: "user",
        path: "/home/roey/.claude/settings.json",
        status: "missing",
        safe_auto_apply: true,
      },
      {
        scope: "project",
        path: "/repo/.claude/settings.json",
        status: "installed",
        safe_auto_apply: true,
        version: "phase5-hooks-v1",
      },
    ],
  },
  chosen_scope: "user",
  can_apply: true,
};

const SPAWNED: SpawnResponse = {
  participant_id: "ag-claude-new",
  tmux_session: "fmark-ag-claude-new",
  runtime_id: "claude",
  active_session: "session-1",
  hooks_status: "installed",
};

function renderModal(
  overrides: Partial<IntegrationSetupModalProps> = {},
): ManagedAgentsClient {
  const apiClient = (overrides.apiClient ?? {
    preflight: vi.fn(),
    integrationApply: vi.fn(async () => PREFLIGHT),
    spawn: vi.fn(async () => SPAWNED),
  }) as ManagedAgentsClient;
  render(
    <IntegrationSetupModal
      runtimeId="claude"
      initialPreflight={PREFLIGHT}
      apiClient={apiClient}
      onClose={vi.fn()}
      onLaunched={vi.fn()}
      {...overrides}
    />,
  );
  return apiClient;
}

function setupItemFor(title: string): HTMLElement {
  const titleNode = screen.getByText(title);
  const item = titleNode.closest(".integration-setup-item");
  expect(item).not.toBeNull();
  return item as HTMLElement;
}

afterEach(() => {
  cleanup();
});

describe("IntegrationSetupModal", () => {
  test("emits selected scope and setup status classes for contrast styling", async () => {
    const user = userEvent.setup();
    renderModal();

    const dialog = screen.getByRole("dialog", { name: /claude/i });
    const globalTab = within(dialog).getByRole("tab", { name: /globally/i });
    const localTab = within(dialog).getByRole("tab", { name: /locally/i });

    expect(globalTab).toHaveAttribute("aria-selected", "true");
    expect(globalTab).toHaveClass("integration-tab", "active");
    expect(localTab).toHaveAttribute("aria-selected", "false");
    expect(localTab).toHaveClass("integration-tab");
    expect(localTab).not.toHaveClass("active");

    expect(setupItemFor("Runtime")).toHaveClass("ready");
    expect(setupItemFor("MCP")).toHaveClass("ready");
    expect(setupItemFor("MCP")).toHaveTextContent("Global: /home/roey/.claude.json");
    expect(setupItemFor("Hook")).toHaveClass("missing");
    expect(setupItemFor("Hook")).toHaveTextContent(
      "Global: /home/roey/.claude/settings.json",
    );
    expect(within(setupItemFor("Hook")).getByRole("button", { name: /setup/i }))
      .toHaveClass("integration-setup-action", "missing");

    await user.click(localTab);

    expect(localTab).toHaveAttribute("aria-selected", "true");
    expect(localTab).toHaveClass("active");
    expect(globalTab).toHaveAttribute("aria-selected", "false");
    expect(globalTab).not.toHaveClass("active");
    expect(setupItemFor("MCP")).toHaveClass("warn");
    expect(setupItemFor("MCP")).toHaveTextContent("Project: /repo/.mcp.json");
    expect(setupItemFor("Hook")).toHaveClass("ready");
    expect(setupItemFor("Hook")).toHaveTextContent(
      "Project: /repo/.claude/settings.json",
    );
  });

  test("codex local tab is disabled because Codex is global-only", async () => {
    renderModal({
      runtimeId: "codex",
      initialPreflight: {
        runtime: {
          runtime_id: "codex",
          executable: "codex",
          available: true,
          version: "codex-cli 0.142.2",
        },
        mcp: {
          status: "blocked",
          locations: [
            {
              scope: "user",
              path: "/home/roey/.codex/config.toml",
              status: "blocked",
              reason: "invalid TOML",
              safe_auto_apply: false,
            },
          ],
        },
        hooks: {
          status: "installed",
          locations: [
            {
              scope: "user",
              path: "/home/roey/.codex/hooks.json",
              status: "installed",
              safe_auto_apply: true,
              version: "managed-only-v3",
            },
          ],
        },
        chosen_scope: "user",
        can_apply: false,
      },
    });

    const localTab = screen.getByRole("tab", { name: /locally/i });
    expect(localTab).toBeDisabled();
    expect(localTab).toHaveAttribute(
      "title",
      "Codex is global-only (CODEX_HOME)",
    );
  });

  test("runtime Setup surfaces the executable error instead of no-oping", async () => {
    const user = userEvent.setup();
    renderModal({
      runtimeId: "opencode",
      initialPreflight: {
        runtime: {
          runtime_id: "opencode",
          executable: "opencode",
          available: false,
          reason: "spawn opencode ENOENT",
        },
        mcp: {
          status: "missing",
          locations: [
            {
              scope: "project",
              path: "/repo/opencode.json",
              status: "missing",
              safe_auto_apply: true,
            },
          ],
        },
        hooks: {
          status: "missing",
          locations: [
            {
              scope: "project",
              path: "/repo/.opencode/plugin/fmark.ts",
              status: "missing",
              safe_auto_apply: true,
            },
          ],
        },
        chosen_scope: "project",
        can_apply: false,
      },
    });

    await user.click(
      within(setupItemFor("Runtime")).getByRole("button", { name: /setup/i }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Runtime: spawn opencode ENOENT/i,
    );
  });

  test("local setup is actionable even when the global config is blocked", async () => {
    const user = userEvent.setup();
    const apiClient = {
      preflight: vi.fn(),
      integrationApply: vi.fn(async () => ({
        runtime: {
          runtime_id: "opencode",
          executable: "/home/roey/.local/share/mise/installs/node/lts/bin/opencode",
          available: true,
          version: "1.15.12",
        },
        mcp: {
          status: "installed",
          locations: [
            {
              scope: "user",
              path: "/home/roey/.config/opencode/opencode.json",
              status: "blocked",
              reason: "invalid JSON/JSONC",
              safe_auto_apply: false,
            },
            {
              scope: "project",
              path: "/repo/opencode.json",
              status: "installed",
              safe_auto_apply: true,
              version: "phase5-stdio-v1",
            },
          ],
        },
        hooks: {
          status: "installed",
          locations: [
            {
              scope: "project",
              path: "/repo/.opencode/plugin/fmark.ts",
              status: "installed",
              safe_auto_apply: true,
              version: "phase-opencode-v1",
            },
          ],
        },
        applied: {
          mcp: {
            scope: "project",
            path: "/repo/opencode.json",
            status: "installed",
            safe_auto_apply: true,
          },
        },
        changed: true,
        chosen_scope: "project",
        can_apply: true,
      })),
      spawn: vi.fn(async () => SPAWNED),
    } as unknown as ManagedAgentsClient;
    renderModal({
      runtimeId: "opencode",
      apiClient,
      initialPreflight: {
        runtime: {
          runtime_id: "opencode",
          executable: "/home/roey/.local/share/mise/installs/node/lts/bin/opencode",
          available: true,
          version: "1.15.12",
        },
        mcp: {
          status: "blocked",
          locations: [
            {
              scope: "user",
              path: "/home/roey/.config/opencode/opencode.json",
              status: "blocked",
              reason: "invalid JSON/JSONC",
              safe_auto_apply: false,
            },
            {
              scope: "project",
              path: "/repo/opencode.json",
              status: "missing",
              safe_auto_apply: true,
            },
          ],
        },
        hooks: {
          status: "installed",
          locations: [
            {
              scope: "project",
              path: "/repo/.opencode/plugin/fmark.ts",
              status: "installed",
              safe_auto_apply: true,
              version: "phase-opencode-v1",
            },
          ],
        },
        chosen_scope: "project",
        can_apply: true,
      },
    });

    await user.click(screen.getByRole("tab", { name: /locally/i }));
    expect(setupItemFor("MCP")).toHaveClass("missing");

    await user.click(
      within(setupItemFor("MCP")).getByRole("button", { name: /setup/i }),
    );

    expect(apiClient.integrationApply).toHaveBeenCalledWith({
      runtime_id: "opencode",
      participant_id: undefined,
      scope: "project",
    });
  });
});
