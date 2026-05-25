/* TopBar — Phase 12 wiring tests.
   The TopBar gains a chip strip (one AgentChip per managed agent, one
   TerminalChip per managed terminal) plus a PlusButton at the end and an
   EnvProbeBanner above the bar. Spawning is wired through the renderer's
   ManagedAgentsClient. */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type MockInstance,
} from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AnyEventRecord,
  EnvProbeResult,
  ManagedAgent,
  ManagedTerminal,
  Participant,
} from "@f-mark/shared";
import { TopBar } from "../../src/shell/TopBar.js";
import { TopBarModalContext } from "../../src/App.js";
import { useStore } from "../../src/state/store.js";
import { DEFAULT_FILTER } from "../../src/popovers/log-filter-types.js";
import { PROCESS_API_DISABLED_MESSAGE } from "../../src/api/managedAgents.js";
import type { SessionMeta } from "../../src/api/client.js";

const SESSION: SessionMeta = {
  id: "2026-05-23-phase12",
  slug: "phase12",
  created_at: "2026-05-23T10:00:00Z",
};

/* Agent participants are bound to SESSION via active_session — the TopBar
   chip strip is scoped to the current session, so test agents that share
   SESSION.id show up in chips. Agents bound to a different session (or
   to no session) are filtered out — see the cross-session test below. */
const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-c92e": {
    kind: "agent",
    name: "Claude",
    color: "#b86a1f",
    active_session: SESSION.id,
  },
  "ag-codex-9b": {
    kind: "agent",
    name: "Codex",
    color: "#1f7ab8",
    active_session: SESSION.id,
  },
};

const AGENTS: ManagedAgent[] = [
  {
    participant_id: "ag-c92e",
    tmux_session: "fmark-ag-c92e",
    runtime_id: "claude",
  },
  {
    participant_id: "ag-codex-9b",
    tmux_session: "fmark-ag-codex-9b",
    runtime_id: "codex",
  },
];

const TERMINALS: ManagedTerminal[] = [
  { tmux_session: "fmark-term-a", label: "scratch" },
  { tmux_session: "fmark-term-b", label: "logs" },
];

const HEALTHY_PROBE: EnvProbeResult = {
  tmux: true,
  tmuxVersion: "3.4",
  runtimes: { claude: true, codex: true, gemini: true },
  installer: "apt",
  os: "linux",
};

const TMUX_MISSING_PROBE: EnvProbeResult = {
  tmux: false,
  tmuxVersion: null,
  runtimes: { claude: true, codex: true, gemini: false },
  installer: "apt",
  os: "linux",
};

interface ResetOverrides {
  managedAgents?: ManagedAgent[];
  managedTerminals?: ManagedTerminal[];
  managedAgentsDisabledReason?: string | null;
  presence?: Record<string, { state: string; last_hook_at: number | null }>;
  envProbe?: EnvProbeResult | null;
  participants?: Record<string, Participant>;
  events?: AnyEventRecord[];
}

function resetStore(overrides: ResetOverrides = {}): void {
  useStore.setState({
    token: null,
    sessions: [SESSION],
    currentSessionId: SESSION.id,
    participants: overrides.participants ?? PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: overrides.events ?? [],
    composeMode: "message",
    commentTarget: null,
    composeDraft: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    viewModeBySession: {},
    activeModal: null,
    settingsSection: "profile",
    editingPreset: null,
    customPresetsVersion: 0,
    activePopover: { key: null, anchorRect: null },
    logFilter: DEFAULT_FILTER,
    presence: {},
    managedAgents: overrides.managedAgents ?? [],
    managedTerminals: overrides.managedTerminals ?? [],
    managedAgentsDisabledReason: overrides.managedAgentsDisabledReason ?? null,
    envProbe: overrides.envProbe ?? null,
  });
  if (overrides.presence !== undefined) {
    const setPresence = useStore.getState().setPresence;
    for (const [id, p] of Object.entries(overrides.presence)) {
      setPresence(id, p as { state: never; last_hook_at: number | null });
    }
  }
}

describe("TopBar — chip strip (Phase 12)", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore();
  });
  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
  });

  test("renders no chips when there are no agent participants and no managed terminals", () => {
    /* Use a user-only participants set so no agent chips render — the new
       contract is "one chip per agent participant", so participants must
       be empty of agents (not just managedAgents) for zero chips. */
    resetStore({
      participants: { "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" } },
    });
    const { container } = render(<TopBar />);
    expect(container.querySelectorAll(".agent-chip").length).toBe(0);
    expect(container.querySelectorAll(".terminal-chip").length).toBe(0);
  });

  test("renders one AgentChip per managed agent", () => {
    resetStore({ managedAgents: AGENTS });
    const { container } = render(<TopBar />);
    const chips = container.querySelectorAll(".agent-chip");
    expect(chips.length).toBe(2);
    const ids = Array.from(chips).map((c) =>
      c.getAttribute("data-participant-id"),
    );
    expect(ids).toContain("ag-c92e");
    expect(ids).toContain("ag-codex-9b");
  });

  test("AgentChip uses participant name from the participants slice", () => {
    resetStore({ managedAgents: AGENTS });
    render(<TopBar />);
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
  });

  test("AgentChip state dot reflects presence map", () => {
    resetStore({
      managedAgents: [AGENTS[0]!],
      presence: { "ag-c92e": { state: "online", last_hook_at: 123 } },
    });
    const { container } = render(<TopBar />);
    const chip = container.querySelector(
      '.agent-chip[data-participant-id="ag-c92e"]',
    );
    expect(chip).not.toBeNull();
    expect(chip!.getAttribute("data-state")).toBe("online");
  });

  test("renders one TerminalChip per managed terminal", () => {
    resetStore({ managedTerminals: TERMINALS });
    const { container } = render(<TopBar />);
    const chips = container.querySelectorAll(".terminal-chip");
    expect(chips.length).toBe(2);
  });

  test("TerminalChip label matches the managed terminal label", () => {
    resetStore({ managedTerminals: TERMINALS });
    render(<TopBar />);
    expect(screen.getByText("scratch")).toBeInTheDocument();
    expect(screen.getByText("logs")).toBeInTheDocument();
  });

  test("renders the PlusButton at the end of the chip strip", () => {
    resetStore();
    render(<TopBar />);
    expect(
      screen.getByRole("button", { name: /add agent or terminal/i }),
    ).toBeInTheDocument();
  });
});

describe("TopBar — EnvProbeBanner (Phase 12)", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore();
  });
  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
  });

  test("does not render banner when envProbe is null", () => {
    resetStore();
    const { container } = render(<TopBar />);
    expect(container.querySelector(".env-probe-banner")).toBeNull();
  });

  test("does not render banner when envProbe is healthy", () => {
    resetStore({ envProbe: HEALTHY_PROBE });
    const { container } = render(<TopBar />);
    expect(container.querySelector(".env-probe-banner")).toBeNull();
  });

  test("renders banner above the chip row when tmux is missing", () => {
    resetStore({ envProbe: TMUX_MISSING_PROBE });
    const { container } = render(<TopBar />);
    const banner = container.querySelector(".env-probe-banner");
    expect(banner).not.toBeNull();
    /* Banner is the first child of the TopBar wrapper (renders above
       everything else). */
    const wrapper = container.firstElementChild!;
    expect(wrapper.firstElementChild).toBe(banner);
  });
});

describe("TopBar — PlusButton spawn wiring (Phase 12)", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore({ envProbe: HEALTHY_PROBE });
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            participant_id: "ag-new",
            tmux_session: "fmark-ag-new",
            runtime_id: "claude",
            active_session: SESSION.id,
            hooks_status: "installed",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    cleanup();
    globalThis.localStorage?.clear();
  });

  test("clicking + then Claude POSTs /managed-agents/spawn with runtime_id=claude", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(
      screen.getByRole("button", { name: /add agent or terminal/i }),
    );
    const menu = screen.getByRole("menu");
    await user.click(
      within(menu).getByRole("menuitem", { name: /claude/i }),
    );
    /* Wait one tick for the async handler to fire. */
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(fetchSpy).toHaveBeenCalled();
    const call = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith("/managed-agents/spawn"),
    );
    expect(call).toBeDefined();
    const body = (call![1] as { body: string }).body;
    expect(body).toContain('"runtime_id":"claude"');
  });

  test("spawn responses with missing Claude hooks open the generic hook modal", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          participant_id: "ag-missing-hooks",
          tmux_session: "fmark-ag-missing-hooks",
          runtime_id: "claude",
          active_session: SESSION.id,
          hooks_status: "missing",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    const openHookInstall = vi.fn();
    resetStore({
      envProbe: HEALTHY_PROBE,
      participants: {
        "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      },
    });
    const { container } = render(
      <TopBarModalContext.Provider
        value={{
          openTerminalOverlay: vi.fn(),
          openHookInstall,
          openReconnect: vi.fn(),
        }}
      >
        <TopBar />
      </TopBarModalContext.Provider>,
    );

    await user.click(
      screen.getByRole("button", { name: /add agent or terminal/i }),
    );
    const menu = screen.getByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /claude/i }));

    await waitFor(() =>
      expect(openHookInstall).toHaveBeenCalledWith("claude", undefined),
    );
    const chip = container.querySelector(
      '.agent-chip[data-participant-id="ag-missing-hooks"]',
    );
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute("data-state")).toBe("hook-not-installed");
  });

  test("clicking + then Manage runtimes opens the Settings modal", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(
      screen.getByRole("button", { name: /add agent or terminal/i }),
    );
    const menu = screen.getByRole("menu");
    await user.click(
      within(menu).getByRole("menuitem", { name: /manage runtimes/i }),
    );
    expect(useStore.getState().activeModal).toBe("settings");
    expect(useStore.getState().settingsSection).toBe("runtimes");
  });

  test("runtime entries still render when env probe reports an empty runtime map", async () => {
    const user = userEvent.setup();
    resetStore({ envProbe: { ...HEALTHY_PROBE, runtimes: {} } });
    render(<TopBar />);
    await user.click(
      screen.getByRole("button", { name: /add agent or terminal/i }),
    );
    const menu = screen.getByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: /claude code/i }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: /^codex$/i }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: /^gemini$/i }),
    ).toBeInTheDocument();
  });

  test("clicking + then Terminal spawns a terminal and opens its overlay", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tmux_session: "fmark-term-1",
          label: "terminal 1",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    const openTerminalOverlay = vi.fn();
    render(
      <TopBarModalContext.Provider
        value={{
          openTerminalOverlay,
          openHookInstall: vi.fn(),
          openReconnect: vi.fn(),
        }}
      >
        <TopBar />
      </TopBarModalContext.Provider>,
    );
    await user.click(
      screen.getByRole("button", { name: /add agent or terminal/i }),
    );
    const menu = screen.getByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /terminal/i }));
    await new Promise<void>((r) => setTimeout(r, 0));

    const call = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith("/managed-agents/terminal"),
    );
    expect(call).toBeDefined();
    expect(openTerminalOverlay).toHaveBeenCalledWith("fmark-term-1");
    expect(useStore.getState().managedTerminals).toContainEqual({
      tmux_session: "fmark-term-1",
      label: "terminal 1",
    });
  });

  test("spawn failures show an inline error instead of failing silently", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(
      screen.getByRole("button", { name: /add agent or terminal/i }),
    );
    const menu = screen.getByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /terminal/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/spawn failed/i),
    );
    expect(screen.getByRole("alert").getAttribute("title")).toMatch(/500/);
    consoleSpy.mockRestore();
  });

  test("process API disabled response becomes a persistent top-bar warning", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error:
            "process-spawning API disabled. Pass --allow-process-api-no-auth to enable under --no-auth.",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<TopBar />);

    await user.click(
      screen.getByRole("button", { name: /add agent or terminal/i }),
    );
    const menu = screen.getByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /terminal/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/spawning disabled/i),
    );
    expect(screen.getByRole("alert").getAttribute("title")).toBe(
      PROCESS_API_DISABLED_MESSAGE,
    );
    expect(useStore.getState().managedAgentsDisabledReason).toBe(
      PROCESS_API_DISABLED_MESSAGE,
    );
    consoleSpy.mockRestore();
  });

  test("known disabled process API disables spawn rows without posting", async () => {
    const user = userEvent.setup();
    resetStore({
      envProbe: HEALTHY_PROBE,
      managedAgentsDisabledReason: PROCESS_API_DISABLED_MESSAGE,
    });
    render(<TopBar />);

    await user.click(
      screen.getByRole("button", { name: /add agent or terminal/i }),
    );
    const menu = screen.getByRole("menu");
    const claude = within(menu).getByRole("menuitem", { name: /claude/i });
    const terminal = within(menu).getByRole("menuitem", { name: /terminal/i });

    expect(claude).toBeDisabled();
    expect(terminal).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/spawning disabled/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("clicking + then Claude adds the new AgentChip to local state immediately after the spawn response", async () => {
    const user = userEvent.setup();
    /* Start with a user-only participants set so we can cleanly assert
       the new chip appears as the *only* chip after spawn. */
    resetStore({
      envProbe: HEALTHY_PROBE,
      participants: { "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" } },
    });
    const { container } = render(<TopBar />);
    /* No chips before the spawn click. */
    expect(container.querySelectorAll(".agent-chip").length).toBe(0);
    /* The spawn handler in TopBar adds the new agent to managedAgents.
       Since the new contract renders one chip per agent *participant*,
       we also need the participants slice to reflect the new agent so
       a chip appears. Simulate the kernel's participants-update by
       seeding the participant alongside the spawn response below. */
    await user.click(
      screen.getByRole("button", { name: /add agent or terminal/i }),
    );
    const menu = screen.getByRole("menu");
    await user.click(
      within(menu).getByRole("menuitem", { name: /claude/i }),
    );
    /* The renderer should add the spawn response to local state immediately;
       no WS round-trip needed. Wait a microtask for the promise chain to
       settle. */
    await new Promise<void>((r) => setTimeout(r, 0));
    /* Seed the matching participant — the kernel normally delivers this via
       WS, but the unit test doesn't have that. The TopBar contract is
       "render every agent participant bound to the current session"; we
       verify the chip appears once the participant is known and its
       active_session matches. */
    act(() => {
      useStore.setState({
        participants: {
          "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
          "ag-new": {
            kind: "agent",
            name: "Claude",
            color: "#b86a1f",
            active_session: SESSION.id,
          },
        },
      });
    });
    const chips = container.querySelectorAll(".agent-chip");
    expect(chips.length).toBe(1);
    expect(chips[0]!.getAttribute("data-participant-id")).toBe("ag-new");
    /* Store reflects the added agent. */
    const agents = useStore.getState().managedAgents;
    expect(agents.find((a) => a.participant_id === "ag-new")).toBeDefined();
  });

  test("spawn responses with hooks_status=not_required do not mark the chip as hook-not-installed", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          participant_id: "ag-gemini-new",
          tmux_session: "fmark-ag-gemini-new",
          runtime_id: "gemini",
          active_session: SESSION.id,
          hooks_status: "not_required",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    resetStore({
      envProbe: HEALTHY_PROBE,
      participants: {
        "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      },
    });
    const { container } = render(<TopBar />);
    await user.click(
      screen.getByRole("button", { name: /add agent or terminal/i }),
    );
    const menu = screen.getByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: /gemini/i }));
    await new Promise<void>((r) => setTimeout(r, 0));
    const chip = container.querySelector(
      '.agent-chip[data-participant-id="ag-gemini-new"]',
    );
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute("data-state")).toBe("stale");
    expect(chip?.querySelector('[data-testid="agent-chip-wrench"]')).toBeNull();
  });
});

describe("TopBar — terminal spawn local state (Phase 12)", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore({ envProbe: HEALTHY_PROBE });
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            tmux_session: "fmark-term-new",
            label: "terminal 1",
            index: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    cleanup();
    globalThis.localStorage?.clear();
  });

  test("clicking + then Terminal adds the new TerminalChip to local state immediately", async () => {
    const user = userEvent.setup();
    const { container } = render(<TopBar />);
    expect(container.querySelectorAll(".terminal-chip").length).toBe(0);
    await user.click(
      screen.getByRole("button", { name: /add agent or terminal/i }),
    );
    const menu = screen.getByRole("menu");
    await user.click(
      within(menu).getByRole("menuitem", { name: /^terminal$/i }),
    );
    await new Promise<void>((r) => setTimeout(r, 0));
    const chips = container.querySelectorAll(".terminal-chip");
    expect(chips.length).toBe(1);
    const terminals = useStore.getState().managedTerminals;
    expect(
      terminals.find((t) => t.tmux_session === "fmark-term-new"),
    ).toBeDefined();
  });
});

describe("TopBar — turn pill gates on agent presence", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore();
  });
  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
  });

  test("turn pill shows Idle when no agent is online (even if the event log's latest turn-end was from a user — which would otherwise say 'Agent thinking…')", () => {
    /* Event log contains a user-finished turn — currentTurnParticipantPrefix
       would resolve to "ag" purely from the log. But no agent presence is
       online/stale, so the pill must read "Idle". */
    const userTurnEnd: AnyEventRecord = {
      filename: "20260523T000001Z_us-a7f3.turn-end.json",
      timestamp: "20260523T000001Z",
      participant_id: "us-a7f3",
      kind: "turn-end",
      payload: { participant_id: "us-a7f3" },
    };
    resetStore({
      events: [userTurnEnd],
      /* No managed agents, no presence — agent is offline / not present. */
    });
    render(<TopBar />);
    /* The pill renders with role="status". */
    const pill = screen.getByRole("status");
    expect(pill.textContent).toContain("Idle");
    expect(pill.textContent).not.toContain("Agent thinking");
  });

  test("turn pill still shows 'Agent thinking…' when an agent has online presence after a user turn-end", () => {
    const userTurnEnd: AnyEventRecord = {
      filename: "20260523T000001Z_us-a7f3.turn-end.json",
      timestamp: "20260523T000001Z",
      participant_id: "us-a7f3",
      kind: "turn-end",
      payload: { participant_id: "us-a7f3" },
    };
    resetStore({
      events: [userTurnEnd],
      managedAgents: [AGENTS[0]!],
      presence: { "ag-c92e": { state: "online", last_hook_at: 1 } },
    });
    render(<TopBar />);
    const pill = screen.getByRole("status");
    expect(pill.textContent).toContain("Agent thinking");
  });

  test("turn pill still shows 'Agent thinking…' when an agent has stale presence", () => {
    const userTurnEnd: AnyEventRecord = {
      filename: "20260523T000001Z_us-a7f3.turn-end.json",
      timestamp: "20260523T000001Z",
      participant_id: "us-a7f3",
      kind: "turn-end",
      payload: { participant_id: "us-a7f3" },
    };
    resetStore({
      events: [userTurnEnd],
      managedAgents: [AGENTS[0]!],
      presence: { "ag-c92e": { state: "stale", last_hook_at: 1 } },
    });
    render(<TopBar />);
    const pill = screen.getByRole("status");
    expect(pill.textContent).toContain("Agent thinking");
  });
});

describe("TopBar — agent participants render as AgentChips, not bare avatars", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore();
  });
  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
  });

  test("agent participant that is NOT in managedAgents still renders as a full AgentChip with name", () => {
    /* Simulate an un-managed agent bound to the current session (e.g.
       registered manually via POST /participants/register + POST
       /agents/:id/link, no spawn). The chip strip is scoped to the
       current session, so active_session must match SESSION.id. */
    const participants: Record<string, Participant> = {
      "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      "ag-old-1": {
        kind: "agent",
        name: "Old Agent",
        color: "#b86a1f",
        active_session: SESSION.id,
      },
    };
    resetStore({
      participants,
      managedAgents: [],
      /* No presence for ag-old-1 — it should appear as offline. */
    });
    const { container } = render(<TopBar />);
    /* The chip is in the chip strip, not in the avatars stack. */
    const chip = container.querySelector(
      '.agent-chip[data-participant-id="ag-old-1"]',
    );
    expect(chip).not.toBeNull();
    expect(chip!.getAttribute("data-state")).toBe("offline");
    /* The chip shows the agent's name. */
    expect(chip!.textContent).toContain("Old Agent");
  });

  test("agent participant does NOT appear as a bare avatar in the right-side participants stack", () => {
    const participants: Record<string, Participant> = {
      "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      "ag-old-1": {
        kind: "agent",
        name: "Old Agent",
        color: "#b86a1f",
        active_session: SESSION.id,
      },
    };
    resetStore({ participants, managedAgents: [] });
    const { container } = render(<TopBar />);
    /* Right-side participants stack should only contain user avatars. */
    const stack = container.querySelector(".participants");
    expect(stack).not.toBeNull();
    /* No agent avatars in the stack. */
    const agentAvatars = stack!.querySelectorAll(".avatar.agent");
    expect(agentAvatars.length).toBe(0);
    /* User avatar still present. */
    const userAvatars = stack!.querySelectorAll(".avatar.user");
    expect(userAvatars.length).toBe(1);
  });

  test("clicking an un-managed agent chip opens the AgentActionMenu", async () => {
    const user = userEvent.setup();
    const participants: Record<string, Participant> = {
      "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      "ag-old-1": {
        kind: "agent",
        name: "Old Agent",
        color: "#b86a1f",
        active_session: SESSION.id,
      },
    };
    resetStore({ participants, managedAgents: [] });
    const { container } = render(<TopBar />);
    const chip = container.querySelector(
      '.agent-chip[data-participant-id="ag-old-1"]',
    ) as HTMLElement | null;
    expect(chip).not.toBeNull();
    await user.click(chip!);
    /* The menu should now be in the DOM. */
    const menu = document.body.querySelector(
      '.agent-action-menu[data-participant-id="ag-old-1"]',
    );
    expect(menu).not.toBeNull();
  });

  test("un-managed agent chip's action menu disables tmux-only actions (Send /compact + hides Say goodbye)", async () => {
    const user = userEvent.setup();
    const participants: Record<string, Participant> = {
      "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      "ag-old-1": {
        kind: "agent",
        name: "Old Agent",
        color: "#b86a1f",
        active_session: SESSION.id,
      },
    };
    resetStore({
      participants,
      managedAgents: [],
      presence: { "ag-old-1": { state: "online", last_hook_at: 1 } },
    });
    const { container } = render(<TopBar />);
    const chip = container.querySelector(
      '.agent-chip[data-participant-id="ag-old-1"]',
    ) as HTMLElement | null;
    expect(chip).not.toBeNull();
    await user.click(chip!);
    /* Send /compact must be disabled because the agent is not managed. */
    const compact = screen.getByRole("menuitem", {
      name: /Send \/compact/i,
    }) as HTMLButtonElement;
    expect(compact.disabled).toBe(true);
    /* Say goodbye must be hidden for un-managed agents. */
    expect(
      screen.queryByRole("menuitem", { name: /Say goodbye/i }),
    ).not.toBeInTheDocument();
  });

  test("hook-not-installed agent chip opens a portal menu with Install hooks", async () => {
    const user = userEvent.setup();
    const openHookInstall = vi.fn();
    const participants: Record<string, Participant> = {
      "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      "ag-needs-hooks": {
        kind: "agent",
        name: "Claude",
        color: "#b86a1f",
        active_session: SESSION.id,
      },
    };
    resetStore({
      participants,
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
    const { container } = render(
      <TopBarModalContext.Provider
        value={{
          openTerminalOverlay: vi.fn(),
          openHookInstall,
          openReconnect: vi.fn(),
        }}
      >
        <TopBar />
      </TopBarModalContext.Provider>,
    );
    const chip = container.querySelector(
      '.agent-chip[data-participant-id="ag-needs-hooks"]',
    ) as HTMLElement | null;
    expect(chip).not.toBeNull();

    await user.click(chip!);
    const portalMenu = document.body.querySelector(
      '.agent-action-menu-popover .agent-action-menu[data-participant-id="ag-needs-hooks"]',
    );
    expect(portalMenu).not.toBeNull();

    await user.click(screen.getByRole("menuitem", { name: /Install hooks/i }));
    expect(openHookInstall).toHaveBeenCalledWith("claude", undefined);
    expect(
      document.body.querySelector(
        '.agent-action-menu[data-participant-id="ag-needs-hooks"]',
      ),
    ).toBeNull();
  });

  test("agent chip strip is sorted by presence state (online first, then offline)", () => {
    const participants: Record<string, Participant> = {
      "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      "ag-offline": {
        kind: "agent",
        name: "AAA Offline",
        color: "#b86a1f",
        active_session: SESSION.id,
      },
      "ag-online": {
        kind: "agent",
        name: "ZZZ Online",
        color: "#1f7ab8",
        active_session: SESSION.id,
      },
    };
    resetStore({
      participants,
      managedAgents: [],
      presence: { "ag-online": { state: "online", last_hook_at: 1 } },
    });
    const { container } = render(<TopBar />);
    const chips = Array.from(
      container.querySelectorAll(".agent-chip"),
    ) as HTMLElement[];
    const ids = chips.map((c) => c.getAttribute("data-participant-id"));
    /* Online agent appears before offline agent regardless of name. */
    expect(ids[0]).toBe("ag-online");
    expect(ids[1]).toBe("ag-offline");
  });

  test("agents bound to a different session do NOT appear in the chip strip", () => {
    /* This is the regression test for the bug: a brand-new session (or
       any session) must not display agents from other sessions, even if
       they exist in the global participants registry. */
    const participants: Record<string, Participant> = {
      "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      "ag-this": {
        kind: "agent",
        name: "Belongs Here",
        color: "#b86a1f",
        active_session: SESSION.id,
      },
      "ag-other": {
        kind: "agent",
        name: "Other Session",
        color: "#1f7ab8",
        active_session: "2026-05-22-some-other-session",
      },
      "ag-unbound": {
        kind: "agent",
        name: "Never Linked",
        color: "#10b981",
        active_session: null,
      },
    };
    resetStore({ participants, managedAgents: [] });
    const { container } = render(<TopBar />);
    const ids = Array.from(container.querySelectorAll(".agent-chip")).map(
      (c) => c.getAttribute("data-participant-id"),
    );
    expect(ids).toEqual(["ag-this"]);
  });

  test("brand-new session shows zero agent chips even when the participants registry is non-empty", () => {
    /* The user-reported bug: creating a new session and seeing all
       historical agents in the top panel. After the fix, switching to
       a fresh session whose id no agent has been bound to → empty chip
       strip. */
    const NEW_SESSION_ID = "2026-05-24-fresh";
    const participants: Record<string, Participant> = {
      "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      "ag-historical-1": {
        kind: "agent",
        name: "Old A",
        color: "#b86a1f",
        active_session: "2026-05-20-old",
      },
      "ag-historical-2": {
        kind: "agent",
        name: "Old B",
        color: "#1f7ab8",
        active_session: "2026-05-21-older",
      },
    };
    resetStore({ participants, managedAgents: [] });
    /* Switch to a session no agent is bound to — emulates "new session
       just created, currentSessionId is its id". */
    act(() => {
      useStore.setState({
        sessions: [
          ...useStore.getState().sessions,
          {
            id: NEW_SESSION_ID,
            slug: "fresh",
            created_at: "2026-05-24T00:00:00Z",
          },
        ],
        currentSessionId: NEW_SESSION_ID,
      });
    });
    const { container } = render(<TopBar />);
    expect(container.querySelectorAll(".agent-chip").length).toBe(0);
  });
});
