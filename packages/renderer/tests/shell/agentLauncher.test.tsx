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
      cardFor("Claude Code").querySelector('[data-provider-icon="claude"]'),
    ).not.toBeNull();
    expect(
      cardFor("Codex").querySelector('[data-provider-icon="openai"]'),
    ).not.toBeNull();
    expect(
      cardFor("Opencode").querySelector('[data-provider-icon="opencode"]'),
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
    expect(card.querySelector("[data-provider-icon]")).toBeNull();
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
});
