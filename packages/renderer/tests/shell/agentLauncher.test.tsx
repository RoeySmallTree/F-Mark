import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentLauncher } from "../../src/shell/AgentLauncher.js";
import {
  AgentSpawnProvider,
  type AgentSpawnRuntime,
  type AgentSpawnValue,
} from "../../src/hooks/useAgentSpawn.js";

afterEach(() => {
  cleanup();
});

function spawnValue(runtimes: AgentSpawnRuntime[]): AgentSpawnValue {
  return {
    runtimes,
    tmuxMissing: false,
    spawnDisabledReason: null,
    spawnError: null,
    connectingAgents: [],
    integrationSetupFor: null,
    setIntegrationSetupFor: vi.fn(),
    setSpawnError: vi.fn(),
    accessModeForRuntime: () => "default",
    accessModeOptionsForRuntime: (runtimeId) =>
      runtimeId === "claude"
        ? [
            {
              id: "default",
              label: "Default",
              description: "Default",
            },
            {
              id: "plan",
              label: "Plan",
              description: "Plan",
            },
          ]
        : [],
    setAccessModeForRuntime: vi.fn(),
    modelForRuntime: () => "",
    effortForRuntime: () => "",
    modelOptionsForRuntime: () => [],
    effortOptionsForRuntime: () => [],
    setModelForRuntime: vi.fn(),
    setEffortForRuntime: vi.fn(),
    onSpawnRuntime: vi.fn(),
    onConfigureRuntime: vi.fn(),
    onManageRuntimes: vi.fn(),
    onSpawnComplete: vi.fn(),
  };
}

function renderLauncher(runtimes: AgentSpawnRuntime[]): void {
  render(
    <AgentSpawnProvider value={spawnValue(runtimes)}>
      <AgentLauncher />
    </AgentSpawnProvider>,
  );
}

function cardFor(label: string): HTMLElement {
  const card = screen.getByText(label).closest(".agent-launcher-card");
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

describe("AgentLauncher provider cards", () => {
  it("uses provider icons for Claude, Codex/OpenAI, and Opencode", () => {
    renderLauncher([
      { id: "claude", displayName: "Claude Code", available: true },
      { id: "codex", displayName: "Codex", available: true },
      { id: "opencode", displayName: "Opencode", available: true },
    ]);

    expect(
      cardFor("Claude Code").querySelector('[data-provider-mark="claude"] [data-agent-kind-art="claude"]'),
    ).not.toBeNull();
    expect(
      cardFor("Codex").querySelector('[data-provider-mark="openai"] [data-agent-kind-art="gpt"]'),
    ).not.toBeNull();
    expect(
      cardFor("Opencode").querySelector('[data-provider-mark="opencode"] [data-agent-kind-art="opencode"]'),
    ).not.toBeNull();

    expect(cardFor("Claude Code").querySelector("[data-provider-initials]"))
      .toBeNull();
    expect(cardFor("Codex").querySelector("[data-provider-initials]"))
      .toBeNull();
    expect(cardFor("Opencode").querySelector("[data-provider-initials]"))
      .toBeNull();
  });

  it("keeps initials as the fallback for unknown custom providers", () => {
    renderLauncher([
      { id: "custom-agent", displayName: "Custom Agent", available: false },
    ]);

    const card = cardFor("Custom Agent");
    expect(card.querySelector('[data-provider-initials="CA"]')).not.toBeNull();
    expect(card.querySelector("[data-agent-kind-art]")).toBeNull();
  });

  it("lets the user choose a launch permission mode", async () => {
    const user = userEvent.setup();
    const value = spawnValue([
      { id: "claude", displayName: "Claude Code", available: true },
    ]);
    render(
      <AgentSpawnProvider value={value}>
        <AgentLauncher />
      </AgentSpawnProvider>,
    );

    await user.selectOptions(
      screen.getByLabelText("Claude Code permission mode"),
      "plan",
    );

    expect(value.setAccessModeForRuntime).toHaveBeenCalledWith(
      "claude",
      "plan",
    );
  });

  it("shows a Connecting… card and disables all connects while a spawn is in flight", () => {
    const value = spawnValue([
      { id: "claude", displayName: "Claude Code", available: true },
      { id: "codex", displayName: "Codex", available: true },
    ]);
    value.connectingAgents = [
      {
        participantId: "ag-codex-1",
        name: "Pixel",
        color: "#123456",
        runtimeId: "codex",
        // The test store has no current session; the launcher matches on it.
        sessionId: null,
        startedAtMs: 0,
      },
    ];
    render(
      <AgentSpawnProvider value={value}>
        <AgentLauncher />
      </AgentSpawnProvider>,
    );

    const codexButton = cardFor("Codex").querySelector(
      ".agent-launcher-connect",
    ) as HTMLButtonElement;
    expect(codexButton.textContent).toContain("Connecting…");
    expect(codexButton.disabled).toBe(true);
    expect(
      codexButton.querySelector(".agent-launcher-connect-spinner"),
    ).not.toBeNull();

    // The sibling card is disabled too — one spawn at a time from the launcher.
    const claudeButton = cardFor("Claude Code").querySelector(
      ".agent-launcher-connect",
    ) as HTMLButtonElement;
    expect(claudeButton.textContent).toBe("Connect");
    expect(claudeButton.disabled).toBe(true);
  });
});
