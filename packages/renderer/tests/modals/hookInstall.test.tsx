/* Phase 12 — HookInstallModal tests.
   Surfaces the kernel's manual-install instructions for the chosen
   runtime + participant id. The modal calls
   ManagedAgentsClient.hookInstallInstructions(opts) once on mount and
   renders the returned markdown + per-step config-path/snippet pairs
   with copy buttons. */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HookInstallInstructions } from "@f-mark/shared";

const INSTRUCTIONS: HookInstallInstructions = {
  markdown:
    "# Install hooks for claude\n\nAdd the snippet below to your config.\n",
  manualSteps: [
    {
      configPath: "/Users/me/.claude/settings.json",
      snippet:
        '{\n  "hooks": {\n    "Stop": [{ "matcher": "*", "hooks": [] }]\n  }\n}',
    },
  ],
};

describe("HookInstallModal", () => {
  afterEach(() => {
    cleanup();
  });

  function makeClient(
    resp: HookInstallInstructions | Promise<HookInstallInstructions>,
  ) {
    return {
      hookInstallInstructions: vi.fn().mockReturnValue(Promise.resolve(resp)),
      // The other methods exist on the real client but aren't used here.
      list: vi.fn(),
      spawn: vi.fn(),
      spawnTerminal: vi.fn(),
      getConfirmToken: vi.fn(),
      goodbye: vi.fn(),
      command: vi.fn(),
      envProbe: vi.fn(),
      refreshEnvProbe: vi.fn(),
      hookInstallStatus: vi.fn(),
      logs: vi.fn(),
    };
  }

  async function flushPromises() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("calls hookInstallInstructions with the three identifiers on mount", async () => {
    const { HookInstallModal } = await import(
      "../../src/modals/HookInstallModal.js"
    );
    const client = makeClient(INSTRUCTIONS);
    render(
      <HookInstallModal
        runtimeId="claude"
        participantId="ag-c92e"
        userParticipantId="us-a7f3"
        apiClient={client as unknown as Parameters<typeof HookInstallModal>[0]["apiClient"]}
        onClose={() => {}}
      />,
    );
    expect(client.hookInstallInstructions).toHaveBeenCalledTimes(1);
    expect(client.hookInstallInstructions).toHaveBeenCalledWith({
      runtime_id: "claude",
      participant_id: "ag-c92e",
      user_participant_id: "us-a7f3",
    });
  });

  it("renders the markdown body after fetch resolves", async () => {
    const { HookInstallModal } = await import(
      "../../src/modals/HookInstallModal.js"
    );
    const client = makeClient(INSTRUCTIONS);
    render(
      <HookInstallModal
        runtimeId="claude"
        participantId="ag-c92e"
        userParticipantId="us-a7f3"
        apiClient={client as unknown as Parameters<typeof HookInstallModal>[0]["apiClient"]}
        onClose={() => {}}
      />,
    );
    await flushPromises();
    // marked converts the H1 to <h1>; testing-library finds it by role.
    expect(
      screen.getByRole("heading", { name: /install hooks for claude/i }),
    ).toBeInTheDocument();
  });

  it("renders the manual-step config path and snippet", async () => {
    const { HookInstallModal } = await import(
      "../../src/modals/HookInstallModal.js"
    );
    const client = makeClient(INSTRUCTIONS);
    render(
      <HookInstallModal
        runtimeId="claude"
        participantId="ag-c92e"
        userParticipantId="us-a7f3"
        apiClient={client as unknown as Parameters<typeof HookInstallModal>[0]["apiClient"]}
        onClose={() => {}}
      />,
    );
    await flushPromises();
    expect(
      screen.getByText("/Users/me/.claude/settings.json"),
    ).toBeInTheDocument();
    expect(screen.getByText(/"matcher": "\*"/)).toBeInTheDocument();
  });

  it("shows a loading state before fetch resolves", async () => {
    let resolveFetch: (i: HookInstallInstructions) => void = () => {};
    const pending = new Promise<HookInstallInstructions>((r) => {
      resolveFetch = r;
    });
    const client = makeClient(pending);
    const { HookInstallModal } = await import(
      "../../src/modals/HookInstallModal.js"
    );
    render(
      <HookInstallModal
        runtimeId="claude"
        participantId="ag-c92e"
        userParticipantId="us-a7f3"
        apiClient={client as unknown as Parameters<typeof HookInstallModal>[0]["apiClient"]}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    // Cleanup: allow the pending promise to resolve so React isn't unhappy.
    resolveFetch(INSTRUCTIONS);
    await flushPromises();
  });

  it("surfaces an error message if fetch rejects", async () => {
    const client = {
      ...makeClient(INSTRUCTIONS),
      hookInstallInstructions: vi.fn().mockRejectedValue(new Error("nope")),
    };
    const { HookInstallModal } = await import(
      "../../src/modals/HookInstallModal.js"
    );
    render(
      <HookInstallModal
        runtimeId="claude"
        participantId="ag-c92e"
        userParticipantId="us-a7f3"
        apiClient={client as unknown as Parameters<typeof HookInstallModal>[0]["apiClient"]}
        onClose={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("alert").textContent).toMatch(/nope/);
  });

  it("Copy button writes the snippet to navigator.clipboard", async () => {
    // userEvent.setup() replaces navigator.clipboard with its own stub, so
    // we must call it FIRST and then override clipboard with our spy.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const { HookInstallModal } = await import(
      "../../src/modals/HookInstallModal.js"
    );
    const client = makeClient(INSTRUCTIONS);
    render(
      <HookInstallModal
        runtimeId="claude"
        participantId="ag-c92e"
        userParticipantId="us-a7f3"
        apiClient={client as unknown as Parameters<typeof HookInstallModal>[0]["apiClient"]}
        onClose={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const copyBtn = screen.getByRole("button", { name: /^copy$/i });
    await user.click(copyBtn);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(INSTRUCTIONS.manualSteps[0]!.snippet);
    delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  });

  it("clicking the X close button calls onClose", async () => {
    const onClose = vi.fn();
    const { HookInstallModal } = await import(
      "../../src/modals/HookInstallModal.js"
    );
    const client = makeClient(INSTRUCTIONS);
    const user = userEvent.setup();
    render(
      <HookInstallModal
        runtimeId="claude"
        participantId="ag-c92e"
        userParticipantId="us-a7f3"
        apiClient={client as unknown as Parameters<typeof HookInstallModal>[0]["apiClient"]}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the backdrop calls onClose; clicking inside does not", async () => {
    const onClose = vi.fn();
    const { HookInstallModal } = await import(
      "../../src/modals/HookInstallModal.js"
    );
    const client = makeClient(INSTRUCTIONS);
    const user = userEvent.setup();
    const { container } = render(
      <HookInstallModal
        runtimeId="claude"
        participantId="ag-c92e"
        userParticipantId="us-a7f3"
        apiClient={client as unknown as Parameters<typeof HookInstallModal>[0]["apiClient"]}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    const backdrop = container.querySelector(".modal-backdrop");
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
