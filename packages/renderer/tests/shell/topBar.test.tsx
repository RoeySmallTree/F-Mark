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
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AnyEventRecord,
  EnvProbeResult,
  ManagedAgent,
  ManagedTerminal,
  Participant,
} from "@f-mark/shared";
import { TopBar } from "../../src/shell/TopBar.js";
import { useStore } from "../../src/state/store.js";
import { DEFAULT_FILTER } from "../../src/popovers/log-filter-types.js";
import type { SessionMeta } from "../../src/api/client.js";

const SESSION: SessionMeta = {
  id: "2026-05-23-phase12",
  slug: "phase12",
  created_at: "2026-05-23T10:00:00Z",
};

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-c92e": { kind: "agent", name: "Claude", color: "#b86a1f" },
  "ag-codex-9b": { kind: "agent", name: "Codex", color: "#1f7ab8" },
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
    editingPreset: null,
    customPresetsVersion: 0,
    activePopover: { key: null, anchorRect: null },
    logFilter: DEFAULT_FILTER,
    presence: {},
    managedAgents: overrides.managedAgents ?? [],
    managedTerminals: overrides.managedTerminals ?? [],
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
       WS, but the unit test doesn't have that. The TopBar contract is now
       "render every agent participant"; we verify the chip appears once
       the participant is known. */
    act(() => {
      useStore.setState({
        participants: {
          "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
          "ag-new": { kind: "agent", name: "Claude", color: "#b86a1f" },
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
    /* Simulate a pre-existing agent from a prior session that's not currently
       managed: it appears in participants but not in managedAgents. */
    const participants: Record<string, Participant> = {
      "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      "ag-old-1": { kind: "agent", name: "Old Agent", color: "#b86a1f" },
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
      "ag-old-1": { kind: "agent", name: "Old Agent", color: "#b86a1f" },
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
      "ag-old-1": { kind: "agent", name: "Old Agent", color: "#b86a1f" },
    };
    resetStore({ participants, managedAgents: [] });
    const { container } = render(<TopBar />);
    const chip = container.querySelector(
      '.agent-chip[data-participant-id="ag-old-1"]',
    ) as HTMLElement | null;
    expect(chip).not.toBeNull();
    await user.click(chip!);
    /* The menu should now be in the DOM. */
    const menu = container.querySelector(
      '.agent-action-menu[data-participant-id="ag-old-1"]',
    );
    expect(menu).not.toBeNull();
  });

  test("un-managed agent chip's action menu disables tmux-only actions (Send /compact + hides Say goodbye)", async () => {
    const user = userEvent.setup();
    const participants: Record<string, Participant> = {
      "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      "ag-old-1": { kind: "agent", name: "Old Agent", color: "#b86a1f" },
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

  test("agent chip strip is sorted by presence state (online first, then offline)", () => {
    const participants: Record<string, Participant> = {
      "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      "ag-offline": { kind: "agent", name: "AAA Offline", color: "#b86a1f" },
      "ag-online": { kind: "agent", name: "ZZZ Online", color: "#1f7ab8" },
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
});
