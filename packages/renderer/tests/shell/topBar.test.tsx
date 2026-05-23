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
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
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
}

function resetStore(overrides: ResetOverrides = {}): void {
  useStore.setState({
    token: null,
    sessions: [SESSION],
    currentSessionId: SESSION.id,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: [],
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

  test("renders no chips when managedAgents and managedTerminals are empty", () => {
    resetStore();
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
});
