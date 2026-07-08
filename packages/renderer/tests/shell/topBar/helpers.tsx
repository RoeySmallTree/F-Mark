import {
  cleanup,
  screen,
  waitFor,
  within,
  type RenderResult,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, vi, type MockInstance } from "vitest";
import type {
  AnyEventRecord,
  EnvProbeResult,
  ManagedAgent,
  ManagedTerminal,
  Participant,
} from "@f-mark/shared";
import { ParticipantStrip } from "../../../src/components/ParticipantStrip.js";
import {
  TopBarModalContext,
  type TopBarModalContextValue,
} from "../../../src/App.js";
import { useStore } from "../../../src/state/store.js";
import { DEFAULT_FILTER } from "../../../src/popovers/log-filter-types.js";
import type { SessionMeta } from "../../../src/api/client.js";
import { renderWithAgentSpawn as render } from "../../agentSpawnProvider.js";

export type FetchMock = MockInstance<typeof fetch>;
export type PreflightHooksStatus = "installed" | "missing" | "not_required";

type FetchCall = Parameters<typeof fetch>;
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type ClickUser = { click: (target: Element) => Promise<void> };
type MenuItemName = string | RegExp;

export const SESSION: SessionMeta = {
  id: "2026-05-23-phase12",
  slug: "phase12",
  created_at: "2026-05-23T10:00:00Z",
};

const USER_ID = "us-a7f3";

function userParticipant(): Participant {
  return { kind: "user", name: "Roey", color: "#2a5fa8" };
}

export function agentParticipant({
  name,
  color = "#b86a1f",
  activeSession = SESSION.id,
}: {
  name: string;
  color?: string;
  activeSession?: string | null;
}): Participant {
  return {
    kind: "agent",
    name,
    color,
    active_session: activeSession,
  };
}

export function userOnlyParticipants(): Record<string, Participant> {
  return { [USER_ID]: userParticipant() };
}

export function participantsWithAgent(
  id: string,
  participant: Participant,
): Record<string, Participant> {
  return { ...userOnlyParticipants(), [id]: participant };
}

export function oldAgentParticipants(): Record<string, Participant> {
  return participantsWithAgent(
    "ag-old-1",
    agentParticipant({ name: "Old Agent" }),
  );
}

/* Agent participants are bound to SESSION via active_session — the TopBar
   chip strip is scoped to the current session, so test agents that share
   SESSION.id show up in chips. Agents bound to a different session (or
   to no session) are filtered out — see the cross-session test below. */
const PARTICIPANTS: Record<string, Participant> = {
  [USER_ID]: userParticipant(),
  "ag-c92e": agentParticipant({ name: "Claude" }),
  "ag-codex-9b": agentParticipant({ name: "Codex", color: "#1f7ab8" }),
};

export const AGENTS: ManagedAgent[] = [
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

export const TERMINALS: ManagedTerminal[] = [
  { tmux_session: "fmark-term-a", label: "scratch", index: 1 },
  { tmux_session: "fmark-term-b", label: "logs", index: 2 },
];

export const HEALTHY_PROBE: EnvProbeResult = {
  tmux: true,
  tmuxVersion: "3.4",
  runtimes: { claude: true, codex: true, opencode: true },
  installer: "apt",
  os: "linux",
};

export const TMUX_MISSING_PROBE: EnvProbeResult = {
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

export function resetStore(overrides: ResetOverrides = {}): void {
  useStore.setState({
    token: null,
    sessions: [SESSION],
    currentSessionId: SESSION.id,
    participants: overrides.participants ?? PARTICIPANTS,
    currentUserId: USER_ID,
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

export function resetTopBarEnvironment(overrides: ResetOverrides = {}): void {
  globalThis.localStorage?.clear();
  resetStore(overrides);
}

export function cleanupTopBarEnvironment(): void {
  cleanup();
  globalThis.localStorage?.clear();
}

export function TopBar(): JSX.Element {
  return <ParticipantStrip variant="compose" />;
}

export function renderTopBar(): RenderResult {
  return render(<TopBar />);
}

export function renderTopBarWithModalContext(
  overrides: Partial<TopBarModalContextValue> = {},
): RenderResult & { modalContext: TopBarModalContextValue } {
  const modalContext: TopBarModalContextValue = {
    openTerminalOverlay: vi.fn(),
    openReconnect: vi.fn(),
    ...overrides,
  };
  const result = render(
    <TopBarModalContext.Provider value={modalContext}>
      <TopBar />
    </TopBarModalContext.Provider>,
  );
  return { ...result, modalContext };
}

export function testRect({
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

async function flushAsyncHandlers(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export async function openSpawnMenu(user: ClickUser): Promise<HTMLElement> {
  await user.click(
    screen.getByRole("button", { name: /add agent/i }),
  );
  return screen.getByRole("menu");
}

export async function chooseSpawnMenuItem(
  user: ClickUser,
  name: MenuItemName,
): Promise<HTMLElement> {
  const menu = await openSpawnMenu(user);
  await user.click(within(menu).getByRole("menuitem", { name }));
  return menu;
}

export async function chooseSpawnMenuItemAndFlush(
  user: ClickUser,
  name: MenuItemName,
): Promise<void> {
  await chooseSpawnMenuItem(user, name);
  await flushAsyncHandlers();
}

async function expectTerminalSpawnAlert(
  user: ClickUser,
  expectedText: RegExp,
): Promise<HTMLElement> {
  renderTopBar();
  await chooseSpawnMenuItem(user, /terminal/i);
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(expectedText),
  );
  return screen.getByRole("alert");
}

export async function triggerTerminalSpawnAlert(
  expectedText: RegExp,
): Promise<HTMLElement> {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    return await expectTerminalSpawnAlert(userEvent.setup(), expectedText);
  } finally {
    consoleSpy.mockRestore();
  }
}

export function agentChips(container: HTMLElement): NodeListOf<Element> {
  return container.querySelectorAll(".agent-chip");
}

export function terminalChips(container: HTMLElement): NodeListOf<Element> {
  return container.querySelectorAll(".terminal-chip");
}

export function agentChipIds(container: HTMLElement): Array<string | null> {
  return Array.from(agentChips(container)).map((chip) =>
    chip.getAttribute("data-participant-id"),
  );
}

function getAgentChip(
  container: HTMLElement,
  participantId: string,
): HTMLElement | null {
  return container.querySelector(
    `.agent-chip[data-participant-id="${participantId}"]`,
  ) as HTMLElement | null;
}

export function expectAgentChip(
  container: HTMLElement,
  participantId: string,
): HTMLElement {
  const chip = getAgentChip(container, participantId);
  expect(chip).not.toBeNull();
  return chip!;
}

export function expectAgentMenuButton(
  container: HTMLElement,
  participantId: string,
): HTMLElement {
  const button = expectAgentChip(container, participantId).querySelector(
    ".agent-chip-icon.menu",
  ) as HTMLElement | null;
  expect(button).not.toBeNull();
  return button!;
}

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

export function mockRuntimesFetch(): FetchMock {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ runtimes: {} }));
}

function findFetchCall(
  fetchSpy: FetchMock,
  endpoint: string,
): FetchCall | undefined {
  return fetchSpy.mock.calls.find(([input]) =>
    fetchInputToUrl(input).endsWith(endpoint),
  );
}

export function expectFetchCall(fetchSpy: FetchMock, endpoint: string): FetchCall {
  const call = findFetchCall(fetchSpy, endpoint);
  expect(call).toBeDefined();
  return call!;
}

export function expectNoFetchCall(fetchSpy: FetchMock, endpoint: string): void {
  expect(findFetchCall(fetchSpy, endpoint)).toBeUndefined();
}

export function fetchCallJsonBody<T>(call: FetchCall): T {
  const body = (call[1] as { body?: unknown } | undefined)?.body;
  if (typeof body !== "string") {
    throw new Error("Expected fetch call body to be a JSON string");
  }
  return JSON.parse(body) as T;
}

export function mockManagedAgentsFetch({
  getPreflightHooksStatus,
}: {
  getPreflightHooksStatus: () => PreflightHooksStatus;
}): FetchMock {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url: FetchInput, init?: FetchInit) => {
      const requestUrl = fetchInputToUrl(url);
      const body = parseRequestBody(init);
      const runtimeId = body.runtime_id ?? "claude";

      const catalogRuntimeId =
        requestUrl.match(/\/runtimes\/([^/?]+)/)?.[1] ?? runtimeId;
      if (requestUrl.includes("/runtimes/") && requestUrl.endsWith("/models")) {
        return jsonResponse({
          models: [
            {
              id: `${catalogRuntimeId}-model`,
              displayName: `${catalogRuntimeId} model`,
            },
          ],
          default_model: `${catalogRuntimeId}-model`,
          default_effort: "medium",
          default_access_mode: "default",
        });
      }
      if (requestUrl.includes("/runtimes/") && requestUrl.includes("/efforts")) {
        return jsonResponse({
          efforts: [{ id: "medium", displayName: "Medium" }],
        });
      }
      if (requestUrl.endsWith("/managed-agents/preflight")) {
        return preflightResponse(runtimeId, getPreflightHooksStatus());
      }
      if (requestUrl.endsWith("/managed-agents/integration-apply")) {
        return integrationApplyResponse(runtimeId);
      }
      if (requestUrl.endsWith("/managed-agents/spawn")) {
        return spawnResponse(runtimeId);
      }
      if (requestUrl.endsWith("/managed-agents/terminal")) {
        return jsonResponse({ tmux_session: "fmark-term-1", label: "terminal 1" });
      }
      return jsonResponse({});
    });
}

function fetchInputToUrl(input: FetchInput): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function parseRequestBody(init?: FetchInit): {
  runtime_id?: string;
  suggested_participant_id?: string;
} {
  return typeof init?.body === "string"
    ? (JSON.parse(init.body) as {
        runtime_id?: string;
        suggested_participant_id?: string;
      })
    : {};
}

function preflightResponse(
  runtimeId: string,
  hooksStatus: PreflightHooksStatus,
): Response {
  return jsonResponse({
    runtime: { runtime_id: runtimeId, executable: runtimeId, available: true },
    mcp: {
      status: "installed",
      expected_version: "phase5-stdio-v1",
      locations: mcpLocationsForRuntime(runtimeId),
    },
    hooks: {
      status: hooksStatus,
      locations: [
        {
          scope: "project",
          path: "/tmp/project-hooks",
          status: hooksStatus,
          safe_auto_apply: true,
        },
        {
          scope: "user",
          path: "/tmp/user-hooks",
          status: hooksStatus,
          safe_auto_apply: true,
        },
      ],
    },
    chosen_scope: "user",
    can_apply: true,
  });
}

function mcpLocationsForRuntime(runtimeId: string): Array<{
  scope: string;
  path: string;
  status: string;
  safe_auto_apply: boolean;
}> {
  return [
    runtimeId === "codex"
      ? {
          scope: "project",
          path: "/tmp/project-config",
          status: "unsupported",
          safe_auto_apply: false,
        }
      : {
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
  ];
}

function integrationApplyResponse(runtimeId: string): Response {
  return jsonResponse({
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
  });
}

function spawnResponse(runtimeId: string): Response {
  const participantId = runtimeId === "opencode" ? "ag-opencode-new" : "ag-new";
  return jsonResponse({
    participant_id: participantId,
    tmux_session: `fmark-${participantId}`,
    runtime_id: runtimeId,
    active_session: SESSION.id,
    hooks_status: runtimeId === "opencode" ? "not_required" : "installed",
  });
}
