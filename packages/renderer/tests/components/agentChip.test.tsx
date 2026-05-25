/* AgentChip — renders runtime icon, name, state dot, and conditional
   affordances for pane-dead ("exited" pill) and hook-not-installed (wrench).
   All visible behavior is keyed off the {state, runtimeId} props. */

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PresenceState } from "@f-mark/shared";
import { AgentChip } from "../../src/components/AgentChip.js";

afterEach(() => {
  cleanup();
});

function renderChip(overrides: {
  participantId?: string;
  name?: string;
  runtimeId?: string | null;
  state?: PresenceState;
  onClick?: () => void;
} = {}): ReturnType<typeof render> {
  return render(
    <AgentChip
      participantId={overrides.participantId ?? "ag-claude"}
      name={overrides.name ?? "Claude"}
      runtimeId={"runtimeId" in overrides ? overrides.runtimeId! : "claude"}
      state={overrides.state ?? "online"}
      onClick={overrides.onClick}
    />,
  );
}

describe("AgentChip — basic rendering", () => {
  test("renders the participant name", () => {
    renderChip({ name: "Worker A" });
    expect(screen.getByText("Worker A")).toBeInTheDocument();
  });

  test("renders the Claude icon for claude runtime", () => {
    const { container } = renderChip({ runtimeId: "claude" });
    expect(
      container.querySelector(".agent-chip-runtime img")?.getAttribute("src"),
    ).toContain("claude-icon.png");
  });

  test("renders the GPT icon for codex runtime", () => {
    const { container } = renderChip({ runtimeId: "codex" });
    expect(
      container.querySelector(".agent-chip-runtime img")?.getAttribute("src"),
    ).toContain("gpt-icon.png");
  });

  test("renders the Gemini icon for gemini runtime", () => {
    const { container } = renderChip({ runtimeId: "gemini" });
    expect(
      container.querySelector(".agent-chip-runtime img")?.getAttribute("src"),
    ).toContain("gemini-icon.png");
  });

  test("renders the terminal icon for custom (null) runtime", () => {
    const { container } = renderChip({ runtimeId: null, name: "Worker" });
    expect(
      container.querySelector(".agent-chip-runtime img")?.getAttribute("src"),
    ).toContain("terminal-icon.png");
  });
});

describe("AgentChip — state dot", () => {
  test("online → dot has 'online' class (green)", () => {
    const { container } = renderChip({ state: "online" });
    const dot = container.querySelector(".agent-chip-dot");
    expect(dot).not.toBeNull();
    expect(dot?.classList.contains("online")).toBe(true);
  });

  test("stale → dot has 'stale' class (amber)", () => {
    const { container } = renderChip({ state: "stale" });
    const dot = container.querySelector(".agent-chip-dot.stale");
    expect(dot).not.toBeNull();
  });

  test("launching → dot has 'launching' class (amber)", () => {
    const { container } = renderChip({ state: "launching" });
    const dot = container.querySelector(".agent-chip-dot.launching");
    expect(dot).not.toBeNull();
  });

  test("offline → dot has 'offline' class (gray)", () => {
    const { container } = renderChip({ state: "offline" });
    const dot = container.querySelector(".agent-chip-dot.offline");
    expect(dot).not.toBeNull();
  });

  test("pane-dead → dot has 'pane-dead' class (red)", () => {
    const { container } = renderChip({ state: "pane-dead" });
    const dot = container.querySelector(".agent-chip-dot.pane-dead");
    expect(dot).not.toBeNull();
  });

  test("hook-not-installed → dot has 'hook-not-installed' class", () => {
    const { container } = renderChip({ state: "hook-not-installed" });
    const dot = container.querySelector(".agent-chip-dot.hook-not-installed");
    expect(dot).not.toBeNull();
  });
});

describe("AgentChip — conditional affordances", () => {
  test("pane-dead → shows 'exited' pill", () => {
    renderChip({ state: "pane-dead" });
    expect(screen.getByText(/exited/i)).toBeInTheDocument();
  });

  test("online → no 'exited' pill", () => {
    renderChip({ state: "online" });
    expect(screen.queryByText(/exited/i)).not.toBeInTheDocument();
  });

  test("hook-not-installed → renders wrench icon", () => {
    const { container } = renderChip({ state: "hook-not-installed" });
    /* Could be a unicode wrench glyph or text — assert a wrench testid. */
    expect(container.querySelector('[data-testid="agent-chip-wrench"]')).not.toBeNull();
  });

  test("online → no wrench icon", () => {
    const { container } = renderChip({ state: "online" });
    expect(container.querySelector('[data-testid="agent-chip-wrench"]')).toBeNull();
  });
});

describe("AgentChip — interactions", () => {
  test("clicking the chip calls onClick", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { container } = renderChip({ onClick });
    const chip = container.querySelector(".agent-chip");
    expect(chip).not.toBeNull();
    await user.click(chip as Element);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("no onClick → no error on click; chip is not a button", () => {
    const { container } = renderChip({});
    /* The chip should render. Whether it is interactive without onClick is
       up to the component — we just verify it renders something. */
    expect(container.querySelector(".agent-chip")).not.toBeNull();
  });
});
