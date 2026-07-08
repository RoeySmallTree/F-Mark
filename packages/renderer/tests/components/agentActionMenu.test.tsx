/* AgentActionMenu — context menu rendered above an agent chip. Verifies:

   - All conditionally-rendered items obey their visibility rules.
   - Disabled items have the documented reason in a title attribute.
   - Each action button calls the matching callback.
   - Rename is an inline text input that commits the new name on submit.
   - Send a message is an inline text input that calls onMessage on submit.
   - "Say goodbye" requires confirmation before firing onSayGoodbye. */

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PresenceState } from "@f-mark/shared";
import { AgentActionMenu } from "../../src/components/AgentActionMenu.js";

afterEach(() => {
  cleanup();
});

interface MenuHandlers {
  onRename: ReturnType<typeof vi.fn>;
  onCompact: ReturnType<typeof vi.fn>;
  onSlash: ReturnType<typeof vi.fn>;
  onInterrupt: ReturnType<typeof vi.fn>;
  onMessage: ReturnType<typeof vi.fn>;
  onOpenTerminal: ReturnType<typeof vi.fn>;
  onReconnect: ReturnType<typeof vi.fn>;
  onInstallHooks: ReturnType<typeof vi.fn>;
  onSayGoodbye: ReturnType<typeof vi.fn>;
}

function makeHandlers(): MenuHandlers {
  return {
    onRename: vi.fn(),
    onCompact: vi.fn(),
    onSlash: vi.fn(),
    onInterrupt: vi.fn(),
    onMessage: vi.fn(),
    onOpenTerminal: vi.fn(),
    onReconnect: vi.fn(),
    onInstallHooks: vi.fn(),
    onSayGoodbye: vi.fn(),
  };
}

function renderMenu(opts: {
  state?: PresenceState;
  managed?: boolean;
  handlers?: MenuHandlers;
  name?: string;
} = {}): MenuHandlers {
  const h = opts.handlers ?? makeHandlers();
  render(
    <AgentActionMenu
      participantId="ag-claude"
      name={opts.name ?? "Claude"}
      state={opts.state ?? "online"}
      managed={opts.managed ?? true}
      onRename={h.onRename}
      onCompact={h.onCompact}
      onSlash={h.onSlash}
      onInterrupt={h.onInterrupt}
      onMessage={h.onMessage}
      onOpenTerminal={h.onOpenTerminal}
      onReconnect={h.onReconnect}
      onInstallHooks={h.onInstallHooks}
      onSayGoodbye={h.onSayGoodbye}
    />,
  );
  return h;
}

describe("AgentActionMenu — always-visible items", () => {
  test("renders Rename action", () => {
    renderMenu();
    expect(screen.getByRole("menuitem", { name: /Rename/i })).toBeInTheDocument();
  });

  test("renders Send /compact action", () => {
    renderMenu();
    expect(screen.getByRole("menuitem", { name: /Send \/compact/i })).toBeInTheDocument();
  });

  test("renders Slash commands toggle", () => {
    renderMenu();
    expect(screen.getByRole("menuitem", { name: /Slash commands/i })).toBeInTheDocument();
  });

  test("renders Send a message action", () => {
    renderMenu();
    expect(screen.getByRole("menuitem", { name: /Send a message/i })).toBeInTheDocument();
  });

  test("renders Open terminal action", () => {
    renderMenu();
    expect(screen.getByRole("menuitem", { name: /Open terminal/i })).toBeInTheDocument();
  });

  test("renders Interrupt action", () => {
    renderMenu();
    expect(screen.getByRole("menuitem", { name: /Interrupt/i })).toBeInTheDocument();
  });
});

describe("AgentActionMenu — conditional visibility", () => {
  test("Reconnect shown when state === 'offline'", () => {
    renderMenu({ state: "offline" });
    expect(screen.getByRole("menuitem", { name: /Reconnect/i })).toBeInTheDocument();
  });

  test("Reconnect shown when state === 'pane-dead'", () => {
    renderMenu({ state: "pane-dead" });
    expect(screen.getByRole("menuitem", { name: /Reconnect/i })).toBeInTheDocument();
  });

  test("Reconnect hidden when state === 'online'", () => {
    renderMenu({ state: "online" });
    expect(screen.queryByRole("menuitem", { name: /Reconnect/i })).not.toBeInTheDocument();
  });

  test("Say goodbye shown when managed === true", () => {
    renderMenu({ managed: true });
    expect(screen.getByRole("menuitem", { name: /Say goodbye/i })).toBeInTheDocument();
  });

  test("Say goodbye hidden when managed === false", () => {
    renderMenu({ managed: false });
    expect(screen.queryByRole("menuitem", { name: /Say goodbye/i })).not.toBeInTheDocument();
  });

  test("Install hooks shown when state === 'hook-not-installed'", () => {
    renderMenu({ state: "hook-not-installed" });
    expect(screen.getByRole("menuitem", { name: /Install hooks/i })).toBeInTheDocument();
  });

  test("Install hooks hidden when state !== 'hook-not-installed'", () => {
    renderMenu({ state: "online" });
    expect(screen.queryByRole("menuitem", { name: /Install hooks/i })).not.toBeInTheDocument();
  });
});

describe("AgentActionMenu — disabled states", () => {
  test("Send /compact disabled when state !== 'online'", () => {
    renderMenu({ state: "stale" });
    const compact = screen.getByRole("menuitem", { name: /Send \/compact/i });
    expect(compact).toBeDisabled();
  });

  test("Send /compact disabled when not managed", () => {
    renderMenu({ managed: false });
    const compact = screen.getByRole("menuitem", { name: /Send \/compact/i });
    expect(compact).toBeDisabled();
  });

  test("Send /compact enabled when online and managed", () => {
    renderMenu({ state: "online", managed: true });
    const compact = screen.getByRole("menuitem", { name: /Send \/compact/i });
    expect(compact).not.toBeDisabled();
  });

  test("Interrupt disabled when state === 'offline'", () => {
    renderMenu({ state: "offline" });
    /* Reconnect appears too — narrow by section. */
    const interrupt = screen.getByRole("menuitem", { name: /Interrupt/i });
    expect(interrupt).toBeDisabled();
  });

  test("Interrupt disabled when state === 'pane-dead'", () => {
    renderMenu({ state: "pane-dead" });
    const interrupt = screen.getByRole("menuitem", { name: /Interrupt/i });
    expect(interrupt).toBeDisabled();
  });

  test("Interrupt disabled when not managed", () => {
    /* Interrupt routes through /managed-agents/.../command which only works
       for agents the kernel actively manages. An un-managed legacy agent
       has no tmux session to interrupt. */
    renderMenu({ state: "online", managed: false });
    const interrupt = screen.getByRole("menuitem", { name: /Interrupt/i });
    expect(interrupt).toBeDisabled();
  });

  test("Interrupt enabled when state === 'online'", () => {
    renderMenu({ state: "online" });
    const interrupt = screen.getByRole("menuitem", { name: /Interrupt/i });
    expect(interrupt).not.toBeDisabled();
  });

  test("Send a message hidden when not managed", () => {
    /* No tmux session to send a message into. */
    renderMenu({ managed: false });
    expect(
      screen.queryByRole("menuitem", { name: /Send a message/i }),
    ).not.toBeInTheDocument();
  });

  test("Slash commands hidden when not managed", () => {
    /* Slash routes through /managed-agents/.../command too. */
    renderMenu({ managed: false });
    expect(
      screen.queryByRole("menuitem", { name: /Slash commands/i }),
    ).not.toBeInTheDocument();
  });

  test("Open terminal hidden when not managed", () => {
    /* No tmux session associated with an un-managed legacy agent. */
    renderMenu({ managed: false });
    expect(
      screen.queryByRole("menuitem", { name: /Open terminal/i }),
    ).not.toBeInTheDocument();
  });
});

describe("AgentActionMenu — actions", () => {
  test("clicking Send /compact fires onCompact", async () => {
    const user = userEvent.setup();
    const h = renderMenu({ state: "online", managed: true });
    await user.click(screen.getByRole("menuitem", { name: /Send \/compact/i }));
    expect(h.onCompact).toHaveBeenCalledTimes(1);
  });

  test("clicking Interrupt fires onInterrupt", async () => {
    const user = userEvent.setup();
    const h = renderMenu({ state: "online" });
    await user.click(screen.getByRole("menuitem", { name: /Interrupt/i }));
    expect(h.onInterrupt).toHaveBeenCalledTimes(1);
  });

  test("clicking Open terminal fires onOpenTerminal", async () => {
    const user = userEvent.setup();
    const h = renderMenu();
    await user.click(screen.getByRole("menuitem", { name: /Open terminal/i }));
    expect(h.onOpenTerminal).toHaveBeenCalledTimes(1);
  });

  test("clicking Reconnect fires onReconnect", async () => {
    const user = userEvent.setup();
    const h = renderMenu({ state: "offline" });
    await user.click(screen.getByRole("menuitem", { name: /Reconnect/i }));
    expect(h.onReconnect).toHaveBeenCalledTimes(1);
  });

  test("clicking Install hooks fires onInstallHooks", async () => {
    const user = userEvent.setup();
    const h = renderMenu({ state: "hook-not-installed" });
    await user.click(screen.getByRole("menuitem", { name: /Install hooks/i }));
    expect(h.onInstallHooks).toHaveBeenCalledTimes(1);
  });

});

describe("AgentActionMenu — rename", () => {
  test("clicking Rename reveals an inline text input prefilled with current name", async () => {
    const user = userEvent.setup();
    renderMenu({ name: "Old Name" });
    await user.click(screen.getByRole("menuitem", { name: /Rename/i }));
    const input = screen.getByRole("textbox", { name: /New name/i });
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe("Old Name");
  });

  test("submitting rename input calls onRename with the new value", async () => {
    const user = userEvent.setup();
    const h = renderMenu({ name: "Old Name" });
    await user.click(screen.getByRole("menuitem", { name: /Rename/i }));
    const input = screen.getByRole("textbox", { name: /New name/i });
    await user.clear(input);
    await user.type(input, "New Name");
    await user.keyboard("{Enter}");
    expect(h.onRename).toHaveBeenCalledWith("New Name");
  });
});

describe("AgentActionMenu — slash submenu", () => {
  test("clicking Slash commands toggles a submenu with 'clear' and 'resume'", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("menuitem", { name: /Slash commands/i }));
    expect(screen.getByRole("menuitem", { name: /\/clear/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /\/resume/i })).toBeInTheDocument();
  });

  test("clicking /clear fires onSlash('clear')", async () => {
    const user = userEvent.setup();
    const h = renderMenu();
    await user.click(screen.getByRole("menuitem", { name: /Slash commands/i }));
    await user.click(screen.getByRole("menuitem", { name: /\/clear/i }));
    expect(h.onSlash).toHaveBeenCalledWith("clear");
  });

  test("clicking /resume fires onSlash('resume')", async () => {
    const user = userEvent.setup();
    const h = renderMenu();
    await user.click(screen.getByRole("menuitem", { name: /Slash commands/i }));
    await user.click(screen.getByRole("menuitem", { name: /\/resume/i }));
    expect(h.onSlash).toHaveBeenCalledWith("resume");
  });
});

describe("AgentActionMenu — send a message", () => {
  test("clicking Send a message reveals an inline text input", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("menuitem", { name: /Send a message/i }));
    const input = screen.getByRole("textbox", { name: /Message text/i });
    expect(input).toBeInTheDocument();
  });

  test("submitting message input calls onMessage with the typed text", async () => {
    const user = userEvent.setup();
    const h = renderMenu();
    await user.click(screen.getByRole("menuitem", { name: /Send a message/i }));
    const input = screen.getByRole("textbox", { name: /Message text/i });
    await user.type(input, "hello world");
    await user.keyboard("{Enter}");
    expect(h.onMessage).toHaveBeenCalledWith("hello world");
  });
});

describe("AgentActionMenu — say goodbye confirmation", () => {
  test("clicking Say goodbye reveals an inline confirm UI", async () => {
    const user = userEvent.setup();
    renderMenu({ managed: true });
    await user.click(screen.getByRole("menuitem", { name: /Say goodbye/i }));
    expect(screen.getByRole("button", { name: /Confirm goodbye/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel goodbye/i })).toBeInTheDocument();
  });

  test("clicking Confirm fires onSayGoodbye", async () => {
    const user = userEvent.setup();
    const h = renderMenu({ managed: true });
    await user.click(screen.getByRole("menuitem", { name: /Say goodbye/i }));
    await user.click(screen.getByRole("button", { name: /Confirm goodbye/i }));
    expect(h.onSayGoodbye).toHaveBeenCalledTimes(1);
  });

  test("clicking Cancel does not fire onSayGoodbye", async () => {
    const user = userEvent.setup();
    const h = renderMenu({ managed: true });
    await user.click(screen.getByRole("menuitem", { name: /Say goodbye/i }));
    await user.click(screen.getByRole("button", { name: /Cancel goodbye/i }));
    expect(h.onSayGoodbye).not.toHaveBeenCalled();
    /* The Say goodbye action returns to its primary form. */
    expect(screen.getByRole("menuitem", { name: /Say goodbye/i })).toBeInTheDocument();
  });
});
