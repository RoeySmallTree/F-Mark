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
import { ParticipantStrip } from "../../src/components/ParticipantStrip.js";
import { TopBar as ShellTopBar } from "../../src/shell/TopBar.js";
import { TopBarModalContext } from "../../src/App.js";
import { ModalRoot } from "../../src/modals/ModalRoot.js";
import { useStore } from "../../src/state/store.js";
import { DEFAULT_FILTER } from "../../src/popovers/log-filter-types.js";
import { PROCESS_API_DISABLED_MESSAGE } from "../../src/api/managedAgents.js";
import type { SessionMeta } from "../../src/api/client.js";
import { renderWithAgentSpawn as render } from "../agentSpawnProvider.js";

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
  runtimes: { claude: true, codex: true, opencode: true },
  installer: "apt",
  os: "linux",
};

const TMUX_MISSING_PROBE: EnvProbeResult = {
  tmux: false,
  tmuxVersion: null,
  runtimes: { claude: true, codex: true, opencode: false },
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

function testRect({
  top,
  left,
  width,
  height,
}: {
  top: number;
  left: number;
  width: number;
  height: number;
}): DOMRect {
  const right = left + width;
  const bottom = top + height;
  return {
    x: left,
    y: top,
    top,
    right,
    bottom,
    left,
    width,
    height,
    toJSON() {
      return { top, right, bottom, left, width, height };
    },
  } as DOMRect;
}

function TopBar(): JSX.Element {
  return <ParticipantStrip variant="compose" />;
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

  test("clicking the current user's avatar opens Settings on Profile", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ runtimes: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
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
    globalThis.localStorage?.clear();
    resetStore();
  });
  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
  });

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
  let fetchSpy: MockInstance<typeof fetch>;
  let preflightHooksStatus: "installed" | "missing" | "not_required";

  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore({ envProbe: HEALTHY_PROBE });
    preflightHooksStatus = "installed";
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const u =
          typeof url === "string"
            ? url
            : url instanceof URL
              ? url.toString()
              : url.url;
        const body =
          typeof init?.body === "string"
            ? (JSON.parse(init.body) as { runtime_id?: string; suggested_participant_id?: string })
            : {};
        const runtimeId = body.runtime_id ?? "claude";
        if (u.endsWith("/managed-agents/preflight")) {
          return new Response(
            JSON.stringify({
              runtime: { runtime_id: runtimeId, executable: runtimeId, available: true },
              mcp: {
                status: "installed",
                expected_version: "phase5-stdio-v1",
                locations: [
                  ...(runtimeId === "codex"
                    ? [
                        {
                          scope: "project",
                          path: "/tmp/project-config",
                          status: "unsupported",
                          safe_auto_apply: false,
                        },
                      ]
                    : [
                        {
                          scope: "project",
                          path: "/tmp/project-config",
                          status: "installed",
                          safe_auto_apply: true,
                        },
                      ]),
                  {
                    scope: "user",
                    path: "/tmp/user-config",
                    status: "installed",
                    safe_auto_apply: true,
                  },
                ],
              },
              hooks: {
                status: preflightHooksStatus,
                locations: [
                  {
                    scope: "project",
                    path: "/tmp/project-hooks",
                    status: preflightHooksStatus,
                    safe_auto_apply: true,
                  },
                  {
                    scope: "user",
                    path: "/tmp/user-hooks",
                    status: preflightHooksStatus,
                    safe_auto_apply: true,
                  },
                ],
              },
              can_apply: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (u.endsWith("/managed-agents/integration-apply")) {
          return new Response(
            JSON.stringify({
              runtime: { runtime_id: runtimeId, executable: runtimeId, available: true },
              mcp: {
                status: "installed",
                expected_version: "phase5-stdio-v1",
                locations: [
                  {
                    scope: "project",
                    path: "/tmp/project-config",
                    status: "installed",
                    safe_auto_apply: true,
                  },
                  {
                    scope: "user",
                    path: "/tmp/user-config",
                    status: "installed",
                    safe_auto_apply: true,
                  },
                ],
              },
              hooks: {
                status: "installed",
                locations: [
                  {
                    scope: "project",
                    path: "/tmp/project-hooks",
                    status: "installed",
                    safe_auto_apply: true,
                  },
                  {
                    scope: "user",
                    path: "/tmp/user-hooks",
                    status: "installed",
                    safe_auto_apply: true,
                  },
                ],
              },
              can_apply: true,
              applied: {
                mcp: {
                  scope: "user",
                  path: "/tmp/user-config",
                  status: "installed",
                  safe_auto_apply: true,
                },
                hooks: {
                  scope: "user",
                  path: "/tmp/user-hooks",
                  status: "installed",
                  safe_auto_apply: true,
                },
              },
              changed: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (u.endsWith("/managed-agents/spawn")) {
          const participantId =
            runtimeId === "opencode" ? "ag-opencode-new" : "ag-new";
          return new Response(
            JSON.stringify({
              participant_id: participantId,
              tmux_session: `fmark-${participantId}`,
              runtime_id: runtimeId,
              active_session: SESSION.id,
              hooks_status:
                runtimeId === "opencode" ? "not_required" : "installed",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
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
    const preflightCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith("/managed-agents/preflight"),
    );
    expect(preflightCall).toBeDefined();
    const preflightBody = JSON.parse(
      (preflightCall![1] as { body: string }).body,
    );
    const call = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith("/managed-agents/spawn"),
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as { body: string }).body);
    expect(preflightBody.runtime_id).toBe("claude");
    expect(preflightBody.participant_id).toMatch(/^ag-claude-/);
    expect(body.runtime_id).toBe("claude");
    expect(body.suggested_participant_id).toBe(preflightBody.participant_id);
  });

  test("missing Claude hooks open setup before spawn", async () => {
    preflightHooksStatus = "missing";
    const user = userEvent.setup();
    resetStore({
      envProbe: HEALTHY_PROBE,
      participants: {
        "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
      },
    });
    render(
      <TopBarModalContext.Provider
        value={{
          openTerminalOverlay: vi.fn(),
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
    await user.click(within(menu).getByRole("menuitem", { name: /claude/i }));

    expect(
      await screen.findByRole("dialog", { name: /claude/i }),
    ).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: /claude/i });
    expect(within(dialog).getByRole("tab", { name: /globally/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(dialog).queryByText("/tmp/project-hooks")).toBeNull();
    expect(within(dialog).queryByText("/tmp/user-hooks")).toBeNull();
    expect(within(dialog).queryByText("/tmp/project-config")).toBeNull();
    expect(within(dialog).queryByText("/tmp/user-config")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /setup/i }));
    const applyCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith("/managed-agents/integration-apply"),
    );
    expect(applyCall).toBeDefined();
    expect(JSON.parse((applyCall![1] as { body: string }).body).scope).toBe(
      "user",
    );
    expect(
      await within(dialog).findByText("We're all set up and ready to go"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /apply and launch/i })).toBeNull();
    expect(within(dialog).getByRole("button", { name: /^launch$/i })).toBeEnabled();
    const spawnCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith("/managed-agents/spawn"),
    );
    expect(spawnCall).toBeUndefined();
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
      within(menu).getByRole("menuitem", { name: /^opencode$/i }),
    ).toBeInTheDocument();
  });

  test("retired runtimes from env probe are not offered in the spawn menu", async () => {
    const user = userEvent.setup();
    resetStore({
      envProbe: {
        ...HEALTHY_PROBE,
        runtimes: { ...HEALTHY_PROBE.runtimes, gemini: true },
      },
    });
    render(<TopBar />);
    await user.click(
      screen.getByRole("button", { name: /add agent or terminal/i }),
    );
    const menu = screen.getByRole("menu");
    expect(
      within(menu).queryByRole("menuitem", { name: /gemini/i }),
    ).toBeNull();
    expect(
      within(menu).getByRole("menuitem", { name: /claude code/i }),
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
    await user.click(within(menu).getByRole("menuitem", { name: /opencode/i }));
    await new Promise<void>((r) => setTimeout(r, 0));
    const chip = container.querySelector(
      '.agent-chip[data-participant-id="ag-opencode-new"]',
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

describe("TopBar — active-turn indicator gates on agent presence", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore();
  });
  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
  });

  test("strip falls back to idle when no agent is online (even if the event log's latest turn-end was from a user)", () => {
    /* Event log contains a user-finished turn — currentTurnParticipantPrefix
       would resolve to "ag" purely from the log. But no agent presence is
       online/stale, so the strip must read "idle" and pulse nothing. */
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
    const { container } = render(<TopBar />);
    expect(container.querySelector(".participant-strip")).not.toBeNull();
    expect(container.querySelectorAll(".active-turn").length).toBe(0);
  });

  test("strip marks an agent as active when it has online presence after a user turn-end", () => {
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
    const { container } = render(
      <ParticipantStrip variant="compose" activeAgentIds={new Set(["ag-c92e"])} />,
    );
    const activeAnchor = container.querySelector(".agent-chip-anchor.active-turn");
    expect(activeAnchor).not.toBeNull();
    expect(activeAnchor!.getAttribute("data-flip-id")).toBe("agent:ag-c92e");
  });

  test("strip still marks the agent active when its presence is stale", () => {
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
    const { container } = render(
      <ParticipantStrip variant="compose" activeAgentIds={new Set(["ag-c92e"])} />,
    );
    expect(
      container.querySelector(".agent-chip-anchor.active-turn"),
    ).not.toBeNull();
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

  test("agent participants render only as chips — never as bare .avatar.agent inside the participant strip", () => {
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
    /* The unified participant strip should hold the chip + user avatar
       only — no orphan agent-kind avatar. */
    const strip = container.querySelector(".participant-strip-scroll");
    expect(strip).not.toBeNull();
    expect(strip!.querySelectorAll(".avatar.agent").length).toBe(0);
    expect(strip!.querySelectorAll(".avatar.user").length).toBe(1);
    expect(
      strip!.querySelectorAll('.agent-chip[data-participant-id="ag-old-1"]')
        .length,
    ).toBe(1);
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

  test("agent action menu flips above a chip near the viewport bottom", async () => {
    const user = userEvent.setup();
    const restoreWidth = window.innerWidth;
    const restoreHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 900,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 500,
    });

    resetStore({ managedAgents: [AGENTS[0]!] });
    const { container } = render(<TopBar />);
    const chip = container.querySelector(
      '.agent-chip[data-participant-id="ag-c92e"]',
    ) as HTMLElement | null;
    expect(chip).not.toBeNull();

    const chipRectSpy = vi.spyOn(chip!, "getBoundingClientRect").mockReturnValue(
      testRect({ top: 450, left: 760, width: 120, height: 30 }),
    );
    const originalRect = Element.prototype.getBoundingClientRect;
    const menuRectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element): DOMRect {
        if (this.classList.contains("agent-action-menu-popover")) {
          return testRect({ top: 484, left: 640, width: 240, height: 360 });
        }
        return originalRect.call(this);
      });

    try {
      await user.click(chip!);

      await waitFor(() => {
        const popover = document.body.querySelector(
          ".agent-action-menu-popover",
        ) as HTMLElement | null;
        expect(popover).not.toBeNull();
        expect(popover).toHaveAttribute("data-placement", "above");
        expect(popover!.style.top).toBe("86px");
        expect(popover!.style.left).toBe("640px");
        expect(popover!.style.maxHeight).toBe("484px");
      });
    } finally {
      chipRectSpy.mockRestore();
      menuRectSpy.mockRestore();
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: restoreWidth,
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: restoreHeight,
      });
    }
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
