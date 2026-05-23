/* TerminalChip — a compact chip representing a managed terminal pane.
   Renders a small terminal-style icon and a label, and fires onClick. */

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TerminalChip } from "../../src/components/TerminalChip.js";

afterEach(() => {
  cleanup();
});

describe("TerminalChip", () => {
  test("renders the provided label", () => {
    render(
      <TerminalChip tmuxSession="fm:tty-1" label="iTerm A" />,
    );
    expect(screen.getByText("iTerm A")).toBeInTheDocument();
  });

  test("renders a terminal icon", () => {
    const { container } = render(
      <TerminalChip tmuxSession="fm:tty-1" label="iTerm A" />,
    );
    expect(container.querySelector(".terminal-chip-icon")).not.toBeNull();
  });

  test("clicking the chip fires onClick", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <TerminalChip
        tmuxSession="fm:tty-1"
        label="iTerm A"
        onClick={onClick}
      />,
    );
    const chip = container.querySelector(".terminal-chip");
    expect(chip).not.toBeNull();
    await user.click(chip as Element);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("renders the tmux-session as a data attribute for inspection", () => {
    const { container } = render(
      <TerminalChip tmuxSession="fm:tty-7" label="Build" />,
    );
    const chip = container.querySelector(".terminal-chip");
    expect(chip?.getAttribute("data-tmux-session")).toBe("fm:tty-7");
  });

  test("renders without onClick — does not throw", () => {
    /* Smoke test: the chip should still mount and show the label even
       when no click handler is supplied. */
    render(<TerminalChip tmuxSession="fm:tty-2" label="Logs" />);
    expect(screen.getByText("Logs")).toBeInTheDocument();
  });

  test("aria-label includes 'Terminal' and the label for screen readers", () => {
    render(
      <TerminalChip
        tmuxSession="fm:tty-1"
        label="Build"
        onClick={() => {}}
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toMatch(/Terminal/i);
    expect(btn.getAttribute("aria-label")).toMatch(/Build/);
  });
});
