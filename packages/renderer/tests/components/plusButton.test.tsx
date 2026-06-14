/* PlusButton — top-bar "+" with a dropdown listing one item per runtime,
   plus a Terminal entry and a "Manage runtimes…" entry separated by rules.

   Behavior tested:
     - Closed by default; click opens the menu.
     - Each runtime shows displayName, disabled iff available=false.
     - Disabled rows expose a "Not on PATH" tooltip via aria-disabled or
       a title attribute.
     - Terminal entry is enabled by default; can be disabled via prop.
     - Manage runtimes… fires onManageRuntimes.
     - Clicking a runtime fires onSpawnRuntime(id) and closes the menu.
     - Esc + outside-click close the menu. */

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
    const btn = screen.getByRole("button", { name: /Add agent or terminal/i });
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
      screen.getByRole("button", { name: /Add agent or terminal/i }),
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
      screen.getByRole("button", { name: /Add agent or terminal/i }),
    );
    const menu = screen.getByRole("menu");
    expect(menu).toHaveStyle({ position: "fixed" });
    expect(menu.style.top).not.toBe("");
    expect(menu.style.right).not.toBe("");
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
      screen.getByRole("button", { name: /Add agent or terminal/i }),
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
      screen.getByRole("button", { name: /Add agent or terminal/i }),
    );

    expect(
      screen
        .getByRole("menuitem", { name: /Claude Code/i })
        .querySelector('[data-provider-icon="claude"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("menuitem", { name: /^Codex/i })
        .querySelector('[data-provider-icon="openai"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("menuitem", { name: /OpenAI CLI/i })
        .querySelector('[data-provider-icon="openai"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("menuitem", { name: /Opencode/i })
        .querySelector('[data-provider-icon="opencode"]'),
    ).not.toBeNull();

    const custom = screen.getByRole("menuitem", { name: /Custom Agent/i });
    expect(custom.querySelector('[data-provider-initials="CA"]')).not.toBeNull();
    expect(custom.querySelector("[data-provider-icon]")).toBeNull();
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
      screen.getByRole("button", { name: /Add agent or terminal/i }),
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
      screen.getByRole("button", { name: /Add agent or terminal/i }),
    );
    const claude = screen.getByRole("menuitem", { name: /Claude Code/i });
    expect(claude).not.toBeDisabled();
  });

  test("Terminal entry shows when no extra props passed", async () => {
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
      screen.getByRole("button", { name: /Add agent or terminal/i }),
    );
    expect(screen.getByRole("menuitem", { name: /Terminal/i })).toBeInTheDocument();
  });

  test("Terminal entry is disabled when tmuxMissing prop is true", async () => {
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
      screen.getByRole("button", { name: /Add agent or terminal/i }),
    );
    const term = screen.getByRole("menuitem", { name: /Terminal/i });
    expect(term).toBeDisabled();
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
      screen.getByRole("button", { name: /Add agent or terminal/i }),
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
      screen.getByRole("button", { name: /Add agent or terminal/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: /Claude Code/i }));
    expect(h.onSpawnRuntime).toHaveBeenCalledWith("claude");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
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
      screen.getByRole("button", { name: /Add agent or terminal/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: /Opencode/i }));
    expect(h.onSpawnRuntime).not.toHaveBeenCalled();
  });

  test("clicking Terminal fires onSpawnTerminal", async () => {
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
      screen.getByRole("button", { name: /Add agent or terminal/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: /Terminal/i }));
    expect(h.onSpawnTerminal).toHaveBeenCalledTimes(1);
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
      screen.getByRole("button", { name: /Add agent or terminal/i }),
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
      screen.getByRole("button", { name: /Add agent or terminal/i }),
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
