/* PlusButton — top-bar "+" with a dropdown listing one item per runtime
   plus a "Manage runtimes…" entry. Standalone terminals live in the Terminal
   dock tab, not in this participant launcher.

   Behavior tested:
     - Closed by default; click opens the menu.
     - Each runtime shows displayName, disabled iff available=false.
     - Disabled rows expose a "Not on PATH" tooltip via aria-disabled or
       a title attribute.
     - Terminal entry is absent from this surface.
     - Manage runtimes… fires onManageRuntimes.
     - Clicking a runtime fires onSpawnRuntime(id) and closes the menu.
     - Esc + outside-click close the menu. */

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlusButton } from "../../src/components/PlusButton.js";

afterEach(() => {
  cleanup();
});

const RUNTIMES = [
  { id: "claude", displayName: "Claude Code", available: true },
  { id: "codex", displayName: "Codex", available: true },
  { id: "opencode", displayName: "Opencode", available: false },
];

interface Handlers {
  onSpawnRuntime: ReturnType<typeof vi.fn>;
  onSpawnTerminal: ReturnType<typeof vi.fn>;
  onManageRuntimes: ReturnType<typeof vi.fn>;
}

function makeHandlers(): Handlers {
  return {
    onSpawnRuntime: vi.fn(),
    onSpawnTerminal: vi.fn(),
    onManageRuntimes: vi.fn(),
  };
}

describe("PlusButton — closed state", () => {
  test("renders the + button", () => {
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={RUNTIMES}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
      />,
    );
    const btn = screen.getByRole("button", { name: /Add agent/i });
    expect(btn).toBeInTheDocument();
  });

  test("menu is not visible by default", () => {
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={RUNTIMES}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
      />,
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("PlusButton — open menu", () => {
  test("clicking the + button opens the menu", async () => {
    const user = userEvent.setup();
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={RUNTIMES}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Add agent/i }),
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  test("menu is fixed-positioned so the top-bar chip scroller cannot clip it", async () => {
    const user = userEvent.setup();
    const h = makeHandlers();
    render(
      <div style={{ overflowX: "auto", overflowY: "hidden" }}>
        <PlusButton
          runtimes={RUNTIMES}
          onSpawnRuntime={h.onSpawnRuntime}
          onSpawnTerminal={h.onSpawnTerminal}
          onManageRuntimes={h.onManageRuntimes}
        />
      </div>,
    );
    await user.click(
      screen.getByRole("button", { name: /Add agent/i }),
    );
    const menu = screen.getByRole("menu");
    expect(menu).toHaveStyle({ position: "fixed" });
    // Uses viewport-clamped fixed coordinates so it can flip above/below the anchor.
    expect(menu.style.top).not.toBe("");
    expect(menu.style.left).not.toBe("");
  });

  test("menu renders one item per runtime", async () => {
    const user = userEvent.setup();
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={RUNTIMES}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Add agent/i }),
    );
    expect(screen.getByRole("menuitem", { name: /Claude Code/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Codex/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Opencode/i })).toBeInTheDocument();
  });

  test("runtime rows use provider icons, with initials only for custom runtimes", async () => {
    const user = userEvent.setup();
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={[
          ...RUNTIMES,
          { id: "openai", displayName: "OpenAI CLI", available: true },
          { id: "custom-agent", displayName: "Custom Agent", available: true },
        ]}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Add agent/i }),
    );

    expect(
      screen
        .getByRole("menuitem", { name: /Claude Code/i })
        .querySelector('[data-provider-mark="claude"] [data-agent-kind-art="claude"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("menuitem", { name: /^Codex/i })
        .querySelector('[data-provider-mark="openai"] [data-agent-kind-art="gpt"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("menuitem", { name: /OpenAI CLI/i })
        .querySelector('[data-provider-mark="openai"] [data-agent-kind-art="gpt"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("menuitem", { name: /Opencode/i })
        .querySelector('[data-provider-mark="opencode"] [data-agent-kind-art="opencode"]'),
    ).not.toBeNull();

    const custom = screen.getByRole("menuitem", { name: /Custom Agent/i });
    expect(custom.querySelector('[data-provider-initials="CA"]')).not.toBeNull();
    expect(custom.querySelector("[data-agent-kind-art]")).toBeNull();
  });

  test("unavailable runtime is disabled with 'Not on PATH' tooltip", async () => {
    const user = userEvent.setup();
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={RUNTIMES}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Add agent/i }),
    );
    const opencode = screen.getByRole("menuitem", { name: /Opencode/i });
    expect(opencode).toBeDisabled();
    expect(opencode.getAttribute("title")).toMatch(/Not on PATH/i);
  });

  test("available runtime is enabled", async () => {
    const user = userEvent.setup();
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={RUNTIMES}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Add agent/i }),
    );
    const claude = screen.getByRole("menuitem", { name: /Claude Code/i });
    expect(claude).not.toBeDisabled();
  });

  test("Terminal entry is not shown in the participant launcher", async () => {
    const user = userEvent.setup();
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={RUNTIMES}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Add agent/i }),
    );
    expect(screen.queryByRole("menuitem", { name: /Terminal/i })).toBeNull();
  });

  test("tmuxMissing does not reintroduce the terminal launcher entry", async () => {
    const user = userEvent.setup();
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={RUNTIMES}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
        tmuxMissing
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Add agent/i }),
    );
    expect(screen.queryByRole("menuitem", { name: /Terminal/i })).toBeNull();
  });

  test("Manage runtimes… entry is present", async () => {
    const user = userEvent.setup();
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={RUNTIMES}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Add agent/i }),
    );
    expect(
      screen.getByRole("menuitem", { name: /Manage runtimes/i }),
    ).toBeInTheDocument();
  });
});

describe("PlusButton — actions", () => {
  test("clicking a runtime fires onSpawnRuntime with the runtime id and closes menu", async () => {
    const user = userEvent.setup();
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={RUNTIMES}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Add agent/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: /Claude Code/i }));
    expect(h.onSpawnRuntime).toHaveBeenCalledWith("claude");
    /* Close is animated now (useDeferredUnmount): the panel stays mounted
       for its exit, so the callback lands a tick later. */
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  test("clicking disabled runtime does not fire onSpawnRuntime", async () => {
    const user = userEvent.setup();
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={RUNTIMES}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Add agent/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: /Opencode/i }));
    expect(h.onSpawnRuntime).not.toHaveBeenCalled();
  });

  test("Terminal absence leaves onSpawnTerminal untouched", async () => {
    const user = userEvent.setup();
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={RUNTIMES}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Add agent/i }),
    );
    expect(screen.queryByRole("menuitem", { name: /Terminal/i })).toBeNull();
    expect(h.onSpawnTerminal).not.toHaveBeenCalled();
  });

  test("clicking Manage runtimes… fires onManageRuntimes", async () => {
    const user = userEvent.setup();
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={RUNTIMES}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Add agent/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: /Manage runtimes/i }));
    expect(h.onManageRuntimes).toHaveBeenCalledTimes(1);
  });

  test("Escape closes the menu", async () => {
    const user = userEvent.setup();
    const h = makeHandlers();
    render(
      <PlusButton
        runtimes={RUNTIMES}
        onSpawnRuntime={h.onSpawnRuntime}
        onSpawnTerminal={h.onSpawnTerminal}
        onManageRuntimes={h.onManageRuntimes}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Add agent/i }),
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    /* Close is animated now (useDeferredUnmount): the panel stays mounted
       for its exit, so the callback lands a tick later. */
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });
});
