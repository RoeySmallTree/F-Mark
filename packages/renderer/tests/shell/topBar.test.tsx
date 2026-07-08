/* TopBar — Phase 12 wiring tests.
   The TopBar gains a participant strip (AgentChip per managed agent,
   current-user chip, and a PlusButton at the end) plus an EnvProbeBanner above
   the bar. Standalone terminals live in the Terminal dock tab instead of this
   member strip. */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopBar as ShellTopBar } from "../../src/shell/TopBar.js";
import { ModalRoot } from "../../src/modals/ModalRoot.js";
import { useStore } from "../../src/state/store.js";
import { PROCESS_API_DISABLED_MESSAGE } from "../../src/api/managedAgents.js";
import { renderWithAgentSpawn as render } from "../agentSpawnProvider.js";
import {
  AGENTS,
  HEALTHY_PROBE,
  TERMINALS,
  TMUX_MISSING_PROBE,
  TopBar,
  agentChipIds,
  agentChips,
  agentParticipant,
  chooseSpawnMenuItem,
  chooseSpawnMenuItemAndFlush,
  cleanupTopBarEnvironment,
  expectAgentChip,
  expectAgentMenuButton,
  expectFetchCall,
  expectNoFetchCall,
  jsonResponse,
  mockManagedAgentsFetch,
  mockRuntimesFetch,
  oldAgentParticipants,
  openSpawnMenu,
  participantsWithAgent,
  renderTopBar,
  renderTopBarWithModalContext,
  resetStore,
  resetTopBarEnvironment,
  terminalChips,
  triggerTerminalSpawnAlert,
  userOnlyParticipants,
  type FetchMock,
  type PreflightHooksStatus,
} from "./topBar/helpers.js";
import {
  crossSessionParticipants,
  expectActionMenuPlacedAbove,
  expectActiveAgentAnchor,
  expectClaudeHooksSetupDialog,
  expectClaudeSpawnRequest,
  expectDefaultRuntimeMenuItems,
  expectGeminiRuntimeRetired,
  expectNoAgentChips,
  expectNoHistoricalAgentChips,
  expectOnlyCurrentSessionAgent,
  expectOnlySpawnedClaudeChip,
  expectReconnectRelaunchedAgent,
  historicalAgentParticipants,
  mockActionMenuRects,
  mockReconnectFetch,
  mockWindowSize,
  presenceSortedParticipants,
  reconnectAgentFromMenu,
  renderActiveParticipantStrip,
  resetActiveAgent,
  resetForSpawnedClaudeChip,
  resetReconnectableAgent,
  seedSpawnedClaudeParticipant,
  switchToFreshSession,
  userTurnEndEvent,
} from "./topBar/scenarios.js";

function mockTerminalEndpoint(fetchSpy: FetchMock, response: Response): void {
  fetchSpy.mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/runtimes/") && url.endsWith("/models")) {
      return jsonResponse({ models: [] });
    }
    if (url.includes("/runtimes/") && url.includes("/efforts")) {
      return jsonResponse({ efforts: [] });
    }
    if (url.endsWith("/managed-agents/terminal")) {
      return response;
    }
    return jsonResponse({});
  });
}

function installManagedAgentsFetchHarness(): () => FetchMock {
  let fetchSpy: FetchMock | undefined;

  beforeEach(() => {
    resetTopBarEnvironment({ envProbe: HEALTHY_PROBE });
    fetchSpy = mockManagedAgentsFetch({
      getPreflightHooksStatus: () => "installed",
    });
  });
  afterEach(() => {
    fetchSpy?.mockRestore();
    cleanupTopBarEnvironment();
    fetchSpy = undefined;
  });

  return () => {
    if (fetchSpy === undefined) {
      throw new Error("Managed agents fetch harness was read before setup");
    }
    return fetchSpy;
  };
}

describe("TopBar — chip strip (Phase 12)", () => {
  beforeEach(() => {
    resetTopBarEnvironment();
  });
  afterEach(cleanupTopBarEnvironment);

  test("renders no chips when there are no agent participants and no managed terminals", () => {
    /* Use a user-only participants set so no agent chips render — the new
       contract is "one chip per agent participant", so participants must
       be empty of agents (not just managedAgents) for zero chips. */
    resetStore({ participants: userOnlyParticipants() });
    const { container } = renderTopBar();
    expect(agentChips(container).length).toBe(0);
    expect(terminalChips(container).length).toBe(0);
  });

  test("renders one AgentChip per managed agent", () => {
    resetStore({ managedAgents: AGENTS });
    const { container } = renderTopBar();
    const chips = agentChips(container);
    expect(chips.length).toBe(2);
    const ids = agentChipIds(container);
    expect(ids).toContain("ag-c92e");
    expect(ids).toContain("ag-codex-9b");
  });

  test("AgentChip uses participant name from the participants slice", () => {
    resetStore({ managedAgents: AGENTS });
    renderTopBar();
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
  });

  test("AgentChip state dot reflects presence map", () => {
    resetStore({
      managedAgents: [AGENTS[0]!],
      presence: { "ag-c92e": { state: "online", last_hook_at: 123 } },
    });
    const { container } = renderTopBar();
    const chip = expectAgentChip(container, "ag-c92e");
    expect(chip.getAttribute("data-state")).toBe("online");
  });
});

describe("TopBar — chip strip (Phase 12)", () => {
  beforeEach(() => {
    resetTopBarEnvironment();
  });
  afterEach(cleanupTopBarEnvironment);

  test("does not render managed terminals as participant-strip members", () => {
    resetStore({ managedTerminals: TERMINALS });
    const { container } = renderTopBar();
    expect(terminalChips(container).length).toBe(0);
    expect(screen.queryByText("scratch")).toBeNull();
    expect(screen.queryByText("logs")).toBeNull();
  });

  test("renders the PlusButton at the end of the chip strip", () => {
    resetStore();
    renderTopBar();
    expect(
      screen.getByRole("button", { name: /add agent/i }),
    ).toBeInTheDocument();
  });
});

describe("TopBar — chip strip (Phase 12)", () => {
  beforeEach(() => {
    resetTopBarEnvironment();
  });
  afterEach(cleanupTopBarEnvironment);

  test("renders dev kernel restart affordance only when enabled", async () => {
    const user = userEvent.setup();
    const onRestart = vi.fn();
    const disabled = render(<ShellTopBar />);
    expect(
      screen.queryByRole("button", { name: /restart kernel/i }),
    ).toBeNull();
    disabled.unmount();

    render(
      <ShellTopBar
        devKernelRestartEnabled
        kernelRestartState="idle"
        onRestartKernel={onRestart}
      />,
    );
    const button = screen.getByRole("button", { name: /restart kernel/i });
    expect(button.getAttribute("title")).toMatch(
      /Restart kernel \(Cmd\+(Alt|Option)\+Ctrl\+R\)/,
    );
    await user.click(button);
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});

describe("TopBar — chip strip (Phase 12)", () => {
  beforeEach(() => {
    resetTopBarEnvironment();
  });
  afterEach(cleanupTopBarEnvironment);

  test("clicking the current user's avatar opens Settings on Profile", async () => {
    const user = userEvent.setup();
    const fetchSpy = mockRuntimesFetch();
    resetStore();
    useStore.setState({ activeModal: null, settingsSection: "agents" });
    render(
      <>
        <TopBar />
        <ModalRoot />
      </>,
    );

    try {
      await user.click(
        screen.getByRole("button", { name: /open profile settings/i }),
      );

      expect(screen.getByRole("dialog", { name: /settings/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /^profile$/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        screen.getByRole("heading", { level: 3, name: /^profile$/i }),
      ).toBeInTheDocument();
      expect(useStore.getState().activeModal).toBe("settings");
      expect(useStore.getState().settingsSection).toBe("profile");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("TopBar — EnvProbeBanner (Phase 12)", () => {
  beforeEach(() => {
    resetTopBarEnvironment();
  });
  afterEach(cleanupTopBarEnvironment);

  test("does not render banner when envProbe is null", () => {
    resetStore();
    const { container } = render(<ShellTopBar />);
    expect(container.querySelector(".env-probe-banner")).toBeNull();
  });

  test("does not render banner when envProbe is healthy", () => {
    resetStore({ envProbe: HEALTHY_PROBE });
    const { container } = render(<ShellTopBar />);
    expect(container.querySelector(".env-probe-banner")).toBeNull();
  });

  test("renders banner above the chip row when tmux is missing", () => {
    resetStore({ envProbe: TMUX_MISSING_PROBE });
    const { container } = render(<ShellTopBar />);
    const banner = container.querySelector(".env-probe-banner");
    expect(banner).not.toBeNull();
    /* Banner is the first child of the TopBar wrapper (renders above
       everything else). */
    const wrapper = container.firstElementChild!;
    expect(wrapper.firstElementChild).toBe(banner);
  });
});

describe("TopBar — PlusButton spawn wiring (Phase 12)", () => {
  let fetchSpy: FetchMock;
  let preflightHooksStatus: PreflightHooksStatus;

  beforeEach(() => {
    resetTopBarEnvironment({ envProbe: HEALTHY_PROBE });
    preflightHooksStatus = "installed";
    fetchSpy = mockManagedAgentsFetch({
      getPreflightHooksStatus: () => preflightHooksStatus,
    });
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    cleanupTopBarEnvironment();
  });

  test("clicking + then Claude POSTs /managed-agents/spawn with runtime_id=claude", async () => {
    const user = userEvent.setup();
    renderTopBar();
    await chooseSpawnMenuItemAndFlush(user, /claude/i);
    expectClaudeSpawnRequest(fetchSpy);
  });

  test("missing Claude hooks open setup before spawn", async () => {
    preflightHooksStatus = "missing";
    const user = userEvent.setup();
    resetStore({
      envProbe: HEALTHY_PROBE,
      participants: userOnlyParticipants(),
    });
    renderTopBarWithModalContext();
    await chooseSpawnMenuItem(user, /claude/i);
    await expectClaudeHooksSetupDialog(user, fetchSpy);
  });
});

describe("TopBar — PlusButton spawn wiring (Phase 12)", () => {
  installManagedAgentsFetchHarness();

  test("clicking + then Manage runtimes opens the Settings modal", async () => {
    const user = userEvent.setup();
    renderTopBar();
    await chooseSpawnMenuItem(user, /manage runtimes/i);
    expect(useStore.getState().activeModal).toBe("settings");
    expect(useStore.getState().settingsSection).toBe("runtimes");
  });

  test("runtime entries still render when env probe reports an empty runtime map", async () => {
    const user = userEvent.setup();
    resetStore({ envProbe: { ...HEALTHY_PROBE, runtimes: {} } });
    renderTopBar();
    expectDefaultRuntimeMenuItems(await openSpawnMenu(user));
  });

  test("retired runtimes from env probe are not offered in the spawn menu", async () => {
    const user = userEvent.setup();
    resetStore({
      envProbe: {
        ...HEALTHY_PROBE,
        runtimes: { ...HEALTHY_PROBE.runtimes, gemini: true },
      },
    });
    renderTopBar();
    expectGeminiRuntimeRetired(await openSpawnMenu(user));
  });
});

describe("TopBar — PlusButton spawn wiring (Phase 12)", () => {
  const fetchSpy = installManagedAgentsFetchHarness();

  test("terminal spawning is absent from the participant launcher", async () => {
    const user = userEvent.setup();
    renderTopBar();
    const menu = await openSpawnMenu(user);

    expect(screen.queryByRole("menuitem", { name: /terminal/i })).toBeNull();
    expect(menu).toBeInTheDocument();
    expectNoFetchCall(fetchSpy(), "/managed-agents/terminal");
  });
});

describe("TopBar — PlusButton spawn wiring (Phase 12)", () => {
  const fetchSpy = installManagedAgentsFetchHarness();

  test("known disabled process API disables spawn rows without posting", async () => {
    const user = userEvent.setup();
    resetStore({
      envProbe: HEALTHY_PROBE,
      managedAgentsDisabledReason: PROCESS_API_DISABLED_MESSAGE,
    });
    renderTopBar();

    await openSpawnMenu(user);
    expect(screen.getByRole("menuitem", { name: /claude/i })).toBeDisabled();
    expect(screen.queryByRole("menuitem", { name: /terminal/i })).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(/spawning disabled/i);
    expectNoFetchCall(fetchSpy(), "/managed-agents/preflight");
    expectNoFetchCall(fetchSpy(), "/managed-agents/spawn");
    expectNoFetchCall(fetchSpy(), "/managed-agents/terminal");
  });

  test("clicking + then Claude adds the new AgentChip to local state immediately after the spawn response", async () => {
    const user = userEvent.setup();
    resetForSpawnedClaudeChip();
    const { container } = renderTopBar();
    expectNoAgentChips(container);
    await chooseSpawnMenuItemAndFlush(user, /claude/i);
    seedSpawnedClaudeParticipant();
    expectOnlySpawnedClaudeChip(container);
  });

  test("spawn responses with hooks_status=not_required do not mark the chip as hook-not-installed", async () => {
    const user = userEvent.setup();
    resetStore({
      envProbe: HEALTHY_PROBE,
      participants: userOnlyParticipants(),
    });
    const { container } = renderTopBar();
    await chooseSpawnMenuItemAndFlush(user, /opencode/i);
    const chip = expectAgentChip(container, "ag-opencode-new");
    expect(chip.getAttribute("data-state")).toBe("stale");
    expect(chip.querySelector('[data-testid="agent-chip-wrench"]')).toBeNull();
  });
});

describe("TopBar — terminal dock ownership (Phase 12)", () => {
  beforeEach(() => {
    resetTopBarEnvironment({ envProbe: HEALTHY_PROBE });
  });
  afterEach(cleanupTopBarEnvironment);

  test("the top-bar launcher leaves standalone terminal state to the Terminal tab", async () => {
    const user = userEvent.setup();
    const { container } = renderTopBar();
    expect(terminalChips(container).length).toBe(0);
    await openSpawnMenu(user);
    expect(screen.queryByRole("menuitem", { name: /^terminal\b/i })).toBeNull();
    expect(useStore.getState().managedTerminals).toEqual([]);
  });
});

describe("TopBar — active-turn indicator gates on agent presence", () => {
  beforeEach(() => {
    resetTopBarEnvironment();
  });
  afterEach(cleanupTopBarEnvironment);

  test("strip falls back to idle when no agent is online (even if the event log's latest turn-end was from a user)", () => {
    /* Event log contains a user-finished turn — currentTurnParticipantPrefix
       would resolve to "ag" purely from the log. But no agent presence is
       online/stale, so the strip must read "idle" and pulse nothing. */
    resetStore({
      events: [userTurnEndEvent()],
      /* No managed agents, no presence — agent is offline / not present. */
    });
    const { container } = renderTopBar();
    expect(container.querySelector(".participant-strip")).not.toBeNull();
    expect(container.querySelectorAll(".active-turn").length).toBe(0);
  });

  test("strip marks an agent as active when it has online presence after a user turn-end", () => {
    resetActiveAgent({ state: "online" });
    const { container } = renderActiveParticipantStrip("ag-c92e");
    expectActiveAgentAnchor(container, "ag-c92e");
  });

  test("strip still marks the agent active when its presence is stale", () => {
    resetActiveAgent({ state: "stale" });
    const { container } = renderActiveParticipantStrip("ag-c92e");
    expectActiveAgentAnchor(container);
  });
});

describe("TopBar — agent participants render as AgentChips, not bare avatars", () => {
  beforeEach(() => {
    resetTopBarEnvironment();
  });
  afterEach(cleanupTopBarEnvironment);

  test("agent participant that is NOT in managedAgents still renders as a full AgentChip with name", () => {
    /* Simulate an un-managed agent bound to the current session (e.g.
       registered manually via POST /participants/register + POST
       /agents/:id/link, no spawn). The chip strip is scoped to the
       current session, so active_session must match SESSION.id. */
    resetStore({ participants: oldAgentParticipants(), managedAgents: [] });
    const { container } = renderTopBar();
    const chip = expectAgentChip(container, "ag-old-1");
    expect(chip.getAttribute("data-state")).toBe("offline");
    expect(chip.textContent).toContain("Old Agent");
  });

  test("agent participants render only as chips — never as bare avatars or three-dot menu triggers", () => {
    resetStore({ participants: oldAgentParticipants(), managedAgents: [] });
    const { container } = renderTopBar();
    const strip = container.querySelector(".participant-strip-scroll");
    expect(strip).not.toBeNull();
    expect(strip!.querySelectorAll(".avatar.agent").length).toBe(0);
    expect(strip!.querySelectorAll(".avatar.user").length).toBe(1);
    expect(
      strip!.querySelectorAll('.agent-chip[data-participant-id="ag-old-1"]')
        .length,
    ).toBe(1);
    expect(strip!.querySelector(".agent-chip-icon.menu")).toBeNull();
    expect(strip!.querySelector(".agent-action-menu")).toBeNull();
  });

  test("clicking an agent model badge opens runtime controls popover", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/runtime/models")) {
        return jsonResponse({ models: [{ id: "gpt-5.5", displayName: "GPT-5.5" }] });
      }
      if (url.includes("/runtime/efforts")) {
        return jsonResponse({ efforts: [{ id: "medium", displayName: "medium" }] });
      }
      return jsonResponse({});
    });
    resetStore({
      participants: oldAgentParticipants(),
      managedAgents: [
        {
          participant_id: "ag-old-1",
          tmux_session: "fmark-ag-old-1",
          runtime_id: "codex",
          runtime_state: {
            model: "gpt-5.5",
            effort: "medium",
            source: "config" as const,
            observedAt: 1,
          },
          access_mode: "never",
        },
      ],
    });
    const { container } = renderTopBar();
    try {
      const chip = expectAgentChip(container, "ag-old-1");
      const modelBadge = chip.querySelector('[data-testid="agent-chip-model"]');
      expect(modelBadge).not.toBeNull();
      await user.click(modelBadge as HTMLElement);
      expect(document.body.querySelector(".agent-chip-editor-pop .agent-runtime-pop")).not.toBeNull();
      expect(
        document.body.querySelector('.agent-action-menu[data-participant-id="ag-old-1"]'),
      ).toBeNull();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("clicking an agent chip opens the runtime popover menu", async () => {
    const user = userEvent.setup();
    resetStore({ participants: oldAgentParticipants(), managedAgents: [] });
    const { container } = renderTopBar();
    await user.click(expectAgentChip(container, "ag-old-1"));
    expect(
      document.body.querySelector(".agent-chip-editor-pop .agent-runtime-pop"),
    ).not.toBeNull();
    expect(
      document.body.querySelector('.agent-action-menu[data-participant-id="ag-old-1"]'),
    ).toBeNull();
  });
});

describe("TopBar — agent participants render as AgentChips, not bare avatars", () => {
  beforeEach(() => {
    resetTopBarEnvironment();
  });
  afterEach(cleanupTopBarEnvironment);

  test("Reconnect relaunches the existing agent instead of opening the guide modal", async () => {
    const user = userEvent.setup();
    const openReconnect = vi.fn();
    const fetchSpy = mockReconnectFetch();
    resetReconnectableAgent();
    const { container } = renderTopBarWithModalContext({ openReconnect });

    try {
      await reconnectAgentFromMenu(user, container);
      await expectReconnectRelaunchedAgent(fetchSpy, openReconnect);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("TopBar — agent participants render as AgentChips, not bare avatars", () => {
  beforeEach(() => {
    resetTopBarEnvironment();
  });
  afterEach(cleanupTopBarEnvironment);

  test("agent runtime popover opens from the full chip near the viewport bottom", async () => {
    const user = userEvent.setup();
    const restoreWindow = mockWindowSize({ width: 900, height: 500 });
    resetStore({ managedAgents: [AGENTS[0]!] });
    const { container } = renderTopBar();
    const chip = expectAgentChip(container, "ag-c92e");
    const restoreRects = mockActionMenuRects(chip);

    try {
      await user.click(chip);
      expect(
        document.body.querySelector(".agent-chip-editor-pop .agent-runtime-pop"),
      ).not.toBeNull();
    } finally {
      restoreRects();
      restoreWindow();
    }
  });
});

describe("TopBar — agent participants render as AgentChips, not bare avatars", () => {
  beforeEach(() => {
    resetTopBarEnvironment();
  });
  afterEach(cleanupTopBarEnvironment);

  test("un-managed agent chip's popover disables live-runtime actions", async () => {
    const user = userEvent.setup();
    resetStore({
      participants: oldAgentParticipants(),
      managedAgents: [],
      presence: { "ag-old-1": { state: "online", last_hook_at: 1 } },
    });
    const { container } = renderTopBar();
    await user.click(expectAgentChip(container, "ag-old-1"));
    const compact = screen.getByRole("button", {
      name: /Compact/i,
    }) as HTMLButtonElement;
    const goodbye = screen.getByRole("button", {
      name: /Say goodbye/i,
    }) as HTMLButtonElement;
    expect(compact.disabled).toBe(true);
    expect(goodbye.disabled).toBe(true);
  });
});

describe("TopBar — agent participants render as AgentChips, not bare avatars", () => {
  beforeEach(() => {
    resetTopBarEnvironment();
  });
  afterEach(cleanupTopBarEnvironment);

  test("hook-not-installed agent chip does not expose the legacy Install hooks action", async () => {
    const user = userEvent.setup();
    resetStore({
      participants: participantsWithAgent(
        "ag-needs-hooks",
        agentParticipant({ name: "Claude" }),
      ),
      managedAgents: [
        {
          participant_id: "ag-needs-hooks",
          tmux_session: "fmark-ag-needs-hooks",
          runtime_id: "claude",
        },
      ],
      presence: {
        "ag-needs-hooks": {
          state: "hook-not-installed",
          last_hook_at: null,
        },
      },
    });
    const { container } = renderTopBarWithModalContext();
    await user.click(expectAgentChip(container, "ag-needs-hooks"));
    expect(
      document.body.querySelector(".agent-chip-editor-pop .agent-runtime-pop"),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: /Install hooks/i }),
    ).not.toBeInTheDocument();
  });
});

describe("TopBar — agent participants render as AgentChips, not bare avatars", () => {
  beforeEach(() => {
    resetTopBarEnvironment();
  });
  afterEach(cleanupTopBarEnvironment);

  test("agent chip strip is sorted by presence state (online first, then offline)", () => {
    resetStore({
      participants: presenceSortedParticipants(),
      managedAgents: [],
      presence: { "ag-online": { state: "online", last_hook_at: 1 } },
    });
    const { container } = renderTopBar();
    const ids = agentChipIds(container);
    /* Online agent appears before offline agent regardless of name. */
    expect(ids[0]).toBe("ag-online");
    expect(ids[1]).toBe("ag-offline");
  });

  test("agents bound to a different session do NOT appear in the chip strip", () => {
    /* This is the regression test for the bug: a brand-new session (or
       any session) must not display agents from other sessions, even if
       they exist in the global participants registry. */
    resetStore({ participants: crossSessionParticipants(), managedAgents: [] });
    expectOnlyCurrentSessionAgent(renderTopBar().container);
  });

  test("brand-new session shows zero agent chips even when the participants registry is non-empty", () => {
    /* The user-reported bug: creating a new session and seeing all
       historical agents in the top panel. After the fix, switching to
       a fresh session whose id no agent has been bound to → empty chip
       strip. */
    resetStore({ participants: historicalAgentParticipants(), managedAgents: [] });
    switchToFreshSession();
    expectNoHistoricalAgentChips(renderTopBar().container);
  });
});
