/* Phase 13 — HookStatusPanel tests.
   Renders one row per registered runtime with a status pill. The status
   is fetched via `apiClient.hookInstallStatus` when a representative
   participant for that runtime is available. Otherwise the row shows
   "Status unknown — needs a registered participant".

   The "Show install instructions" button calls `onShowInstructions(id)`
   with the runtime id (the parent owns the HookInstallModal opening
   logic and the user_participant_id). */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  HookInstallStatus,
  RuntimeEntry,
} from "@f-mark/shared";
import { HookStatusPanel } from "../../../src/modals/settings/HookStatusPanel.js";

afterEach(() => {
  cleanup();
});

const RUNTIMES: Record<string, RuntimeEntry> = {
  claude: {
    displayName: "Claude Code",
    executable: "claude",
    args: [],
    icon: "claude",
  },
  codex: {
    displayName: "Codex",
    executable: "codex",
    args: [],
    icon: "codex",
  },
};

function makeClient(
  status:
    | HookInstallStatus
    | Error
    | Promise<HookInstallStatus>,
): {
  hookInstallStatus: ReturnType<typeof vi.fn>;
} & Record<string, ReturnType<typeof vi.fn>> {
  const fn = vi.fn();
  if (status instanceof Error) fn.mockRejectedValue(status);
  else fn.mockReturnValue(Promise.resolve(status));
  return {
    hookInstallStatus: fn,
    list: vi.fn(),
    spawn: vi.fn(),
    spawnTerminal: vi.fn(),
    getConfirmToken: vi.fn(),
    goodbye: vi.fn(),
    command: vi.fn(),
    envProbe: vi.fn(),
    refreshEnvProbe: vi.fn(),
    hookInstallInstructions: vi.fn(),
    logs: vi.fn(),
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("HookStatusPanel", () => {
  it("renders one row per runtime", () => {
    const client = makeClient({
      installed: true,
      configPath: "/home/me/.claude/settings.json",
      detectedEntries: [],
      expectedEntries: [],
    });
    render(
      <HookStatusPanel
        runtimes={RUNTIMES}
        participantIdForRuntime={{}}
        userParticipantId="us-a7f3"
        apiClient={client as never}
        onShowInstructions={() => {}}
      />,
    );
    expect(screen.getByTestId("hook-row-claude")).toBeInTheDocument();
    expect(screen.getByTestId("hook-row-codex")).toBeInTheDocument();
  });

  it("shows 'needs a registered participant' when no agent is mapped", () => {
    const client = makeClient({
      installed: true,
      configPath: "/x",
      detectedEntries: [],
      expectedEntries: [],
    });
    render(
      <HookStatusPanel
        runtimes={RUNTIMES}
        participantIdForRuntime={{}}
        userParticipantId="us-a7f3"
        apiClient={client as never}
        onShowInstructions={() => {}}
      />,
    );
    const claudeRow = screen.getByTestId("hook-row-claude");
    expect(claudeRow.textContent).toMatch(/needs a registered participant/i);
    expect(client.hookInstallStatus).not.toHaveBeenCalled();
  });

  it("fetches hookInstallStatus and shows 'installed' when matched", async () => {
    const client = makeClient({
      installed: true,
      configPath: "/home/me/.claude/settings.json",
      detectedEntries: [
        {
          event: "Stop",
          command: "curl http://localhost:7777/hooks/agent-stop",
        },
      ],
      expectedEntries: [
        {
          event: "Stop",
          command: "curl http://localhost:7777/hooks/agent-stop",
        },
      ],
    });
    render(
      <HookStatusPanel
        runtimes={RUNTIMES}
        participantIdForRuntime={{ claude: "ag-c92e" }}
        userParticipantId="us-a7f3"
        apiClient={client as never}
        onShowInstructions={() => {}}
      />,
    );
    await flush();
    expect(client.hookInstallStatus).toHaveBeenCalledWith({
      runtime_id: "claude",
      participant_id: "ag-c92e",
      user_participant_id: "us-a7f3",
    });
    const claudeRow = screen.getByTestId("hook-row-claude");
    expect(within(claudeRow).getByText(/installed/i)).toBeInTheDocument();
  });

  it("shows 'partial' when detected entries are a subset of expected", async () => {
    const client = makeClient({
      installed: false,
      configPath: "/x",
      detectedEntries: [{ event: "Stop", command: "curl X" }],
      expectedEntries: [
        { event: "Stop", command: "curl X" },
        { event: "PreToolUse", command: "curl Y" },
      ],
    });
    render(
      <HookStatusPanel
        runtimes={{ claude: RUNTIMES.claude! }}
        participantIdForRuntime={{ claude: "ag-c92e" }}
        userParticipantId="us-a7f3"
        apiClient={client as never}
        onShowInstructions={() => {}}
      />,
    );
    await flush();
    const row = screen.getByTestId("hook-row-claude");
    expect(within(row).getByText(/partial/i)).toBeInTheDocument();
  });

  it("shows 'not installed' when no detected entries", async () => {
    const client = makeClient({
      installed: false,
      configPath: "/x",
      detectedEntries: [],
      expectedEntries: [{ event: "Stop", command: "curl X" }],
    });
    render(
      <HookStatusPanel
        runtimes={{ claude: RUNTIMES.claude! }}
        participantIdForRuntime={{ claude: "ag-c92e" }}
        userParticipantId="us-a7f3"
        apiClient={client as never}
        onShowInstructions={() => {}}
      />,
    );
    await flush();
    const row = screen.getByTestId("hook-row-claude");
    expect(within(row).getByText(/not installed/i)).toBeInTheDocument();
  });

  it("shows 'error' when the status fetch rejects", async () => {
    const client = makeClient(new Error("boom"));
    render(
      <HookStatusPanel
        runtimes={{ claude: RUNTIMES.claude! }}
        participantIdForRuntime={{ claude: "ag-c92e" }}
        userParticipantId="us-a7f3"
        apiClient={client as never}
        onShowInstructions={() => {}}
      />,
    );
    await flush();
    const row = screen.getByTestId("hook-row-claude");
    expect(within(row).getByText(/error/i)).toBeInTheDocument();
  });

  it("Show install instructions button fires the callback with runtime id", async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    const client = makeClient({
      installed: false,
      configPath: "/x",
      detectedEntries: [],
      expectedEntries: [{ event: "Stop", command: "curl X" }],
    });
    render(
      <HookStatusPanel
        runtimes={{ claude: RUNTIMES.claude! }}
        participantIdForRuntime={{ claude: "ag-c92e" }}
        userParticipantId="us-a7f3"
        apiClient={client as never}
        onShowInstructions={onShow}
      />,
    );
    await flush();
    const row = screen.getByTestId("hook-row-claude");
    await user.click(
      within(row).getByRole("button", { name: /show install instructions/i }),
    );
    expect(onShow).toHaveBeenCalledWith("claude", "ag-c92e");
  });
});
