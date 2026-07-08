import {
  act,
  screen,
  waitFor,
  within,
  type RenderResult,
} from "@testing-library/react";
import { expect, vi } from "vitest";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { ParticipantStrip } from "../../../src/components/ParticipantStrip.js";
import { useStore } from "../../../src/state/store.js";
import { renderWithAgentSpawn as render } from "../../agentSpawnProvider.js";
import {
  AGENTS,
  HEALTHY_PROBE,
  SESSION,
  agentChipIds,
  agentChips,
  agentParticipant,
  expectAgentChip,
  expectAgentMenuButton,
  expectFetchCall,
  expectNoFetchCall,
  fetchCallJsonBody,
  jsonResponse,
  resetStore,
  testRect,
  userOnlyParticipants,
  type FetchMock,
} from "./helpers.js";

type ClickUser = { click: (target: Element) => Promise<void> };

export function expectClaudeSpawnRequest(fetchSpy: FetchMock): void {
  expect(fetchSpy).toHaveBeenCalled();
  const preflightBody = fetchCallJsonBody<{
    runtime_id?: string;
    participant_id?: string;
  }>(expectFetchCall(fetchSpy, "/managed-agents/preflight"));
  const body = fetchCallJsonBody<{
    runtime_id?: string;
    suggested_participant_id?: string;
  }>(expectFetchCall(fetchSpy, "/managed-agents/spawn"));
  expect(preflightBody.runtime_id).toBe("claude");
  expect(preflightBody.participant_id).toMatch(/^ag-claude-/);
  expect(body.runtime_id).toBe("claude");
  expect(body.suggested_participant_id).toBe(preflightBody.participant_id);
}

export async function expectClaudeHooksSetupDialog(
  user: ClickUser,
  fetchSpy: FetchMock,
): Promise<void> {
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
  expect(
    fetchCallJsonBody<{ scope?: string }>(
      expectFetchCall(fetchSpy, "/managed-agents/integration-apply"),
    ).scope,
  ).toBe("user");
  expect(
    await within(dialog).findByText("We're all set up and ready to go"),
  ).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: /apply and launch/i })).toBeNull();
  expect(within(dialog).getByRole("button", { name: /^launch$/i })).toBeEnabled();
  expectNoFetchCall(fetchSpy, "/managed-agents/spawn");
}

export function expectDefaultRuntimeMenuItems(menu: HTMLElement): void {
  expect(
    within(menu).getByRole("menuitem", { name: /claude code/i }),
  ).toBeInTheDocument();
  expect(
    within(menu).getByRole("menuitem", { name: /^codex\b/i }),
  ).toBeInTheDocument();
  expect(
    within(menu).getByRole("menuitem", { name: /^opencode\b/i }),
  ).toBeInTheDocument();
}

export function expectGeminiRuntimeRetired(menu: HTMLElement): void {
  expect(
    within(menu).queryByRole("menuitem", { name: /gemini/i }),
  ).toBeNull();
  expect(
    within(menu).getByRole("menuitem", { name: /claude code/i }),
  ).toBeInTheDocument();
}

export function seedSpawnedClaudeParticipant(): void {
  act(() => {
    useStore.setState({
      participants: {
        ...userOnlyParticipants(),
        "ag-new": agentParticipant({ name: "Claude" }),
      },
    });
  });
}

export function expectOnlySpawnedClaudeChip(container: HTMLElement): void {
  const chips = agentChips(container);
  expect(chips.length).toBe(1);
  expect(chips[0]!.getAttribute("data-participant-id")).toBe("ag-new");
  expect(
    useStore.getState().managedAgents.find((a) => a.participant_id === "ag-new"),
  ).toBeDefined();
}

export function userTurnEndEvent(): AnyEventRecord {
  return {
    filename: "20260523T000001Z_us-a7f3.turn-end.json",
    timestamp: "20260523T000001Z",
    participant_id: "us-a7f3",
    kind: "turn-end",
    payload: { participant_id: "us-a7f3" },
  };
}

export function renderActiveParticipantStrip(agentId: string): RenderResult {
  return render(
    <ParticipantStrip variant="compose" activeAgentIds={new Set([agentId])} />,
  );
}

export function expectActiveAgentAnchor(
  container: HTMLElement,
  agentId?: string,
): void {
  const activeAnchor = container.querySelector(".agent-chip-anchor.active-turn");
  expect(activeAnchor).not.toBeNull();
  if (agentId !== undefined) {
    expect(activeAnchor!.getAttribute("data-flip-id")).toBe(`agent:${agentId}`);
  }
}

export function mockReconnectFetch(): FetchMock {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = fetchInputToUrl(input);
      if (url.endsWith("/managed-agents/ag-c92e/reconnect")) {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeUndefined();
        return reconnectedAgentResponse();
      }
      if (url.includes("/guide")) {
        throw new Error("Reconnect should not fetch the guide");
      }
      return jsonResponse({});
    });
}

export function resetReconnectableAgent(): void {
  resetStore({
    managedAgents: [
      { participant_id: "ag-c92e", tmux_session: null, runtime_id: "claude" },
    ],
    presence: {
      "ag-c92e": { state: "pane-dead", last_hook_at: null },
    },
  });
}

export async function reconnectAgentFromMenu(
  user: ClickUser,
  container: HTMLElement,
): Promise<void> {
  await user.click(expectAgentChip(container, "ag-c92e"));
  await user.click(screen.getByRole("button", { name: /Reconnect/i }));
}

export async function expectReconnectRelaunchedAgent(
  fetchSpy: FetchMock,
  openReconnect: ReturnType<typeof vi.fn>,
): Promise<void> {
  await waitFor(() => {
    const agent = useStore
      .getState()
      .managedAgents.find((a) => a.participant_id === "ag-c92e");
    expect(agent?.tmux_session).toBe("fmark-ag-c92e-reconnected");
  });
  expect(openReconnect).not.toHaveBeenCalled();
  expect(fetchSpy.mock.calls.some(([input]) => fetchInputToUrl(input).includes("/guide"))).toBe(false);
  expect(useStore.getState().presence["ag-c92e"]?.state).toBe("launching");
  expect(useStore.getState().participants["ag-c92e"]?.active_session).toBe(
    SESSION.id,
  );
}

export function mockWindowSize({
  width,
  height,
}: {
  width: number;
  height: number;
}): () => void {
  const restoreWidth = window.innerWidth;
  const restoreHeight = window.innerHeight;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  return () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: restoreWidth,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: restoreHeight,
    });
  };
}

export function mockActionMenuRects(chip: HTMLElement): () => void {
  const chipRectSpy = vi
    .spyOn(chip, "getBoundingClientRect")
    .mockReturnValue(testRect({ top: 450, left: 760, width: 120, height: 30 }));
  const originalRect = Element.prototype.getBoundingClientRect;
  const menuRectSpy = vi
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element): DOMRect {
      if (
        this.classList.contains("agent-chip-icon") &&
        this.classList.contains("menu") &&
        chip.contains(this)
      ) {
        return testRect({ top: 450, left: 760, width: 120, height: 30 });
      }
      if (this.classList.contains("agent-action-menu-popover")) {
        return testRect({ top: 484, left: 640, width: 240, height: 360 });
      }
      return originalRect.call(this);
    });
  return () => {
    chipRectSpy.mockRestore();
    menuRectSpy.mockRestore();
  };
}

export async function expectActionMenuPlacedAbove(
  user: ClickUser,
  chip: HTMLElement,
): Promise<void> {
  const menuButton = chip.querySelector(".agent-chip-icon.menu");
  expect(menuButton).not.toBeNull();
  await user.click(menuButton!);
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
}

export function presenceSortedParticipants(): Record<string, Participant> {
  return {
    ...userOnlyParticipants(),
    "ag-offline": agentParticipant({ name: "AAA Offline" }),
    "ag-online": agentParticipant({ name: "ZZZ Online", color: "#1f7ab8" }),
  };
}

export function crossSessionParticipants(): Record<string, Participant> {
  return {
    ...userOnlyParticipants(),
    "ag-this": agentParticipant({ name: "Belongs Here" }),
    "ag-other": agentParticipant({
      name: "Other Session",
      color: "#1f7ab8",
      activeSession: "2026-05-22-some-other-session",
    }),
    "ag-unbound": agentParticipant({
      name: "Never Linked",
      color: "#10b981",
      activeSession: null,
    }),
  };
}

export function historicalAgentParticipants(): Record<string, Participant> {
  return {
    ...userOnlyParticipants(),
    "ag-historical-1": agentParticipant({
      name: "Old A",
      activeSession: "2026-05-20-old",
    }),
    "ag-historical-2": agentParticipant({
      name: "Old B",
      color: "#1f7ab8",
      activeSession: "2026-05-21-older",
    }),
  };
}

export function switchToFreshSession(): void {
  act(() => {
    useStore.setState({
      sessions: [
        ...useStore.getState().sessions,
        {
          id: "2026-05-24-fresh",
          slug: "fresh",
          created_at: "2026-05-24T00:00:00Z",
        },
      ],
      currentSessionId: "2026-05-24-fresh",
    });
  });
}

function fetchInputToUrl(input: Parameters<typeof fetch>[0]): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function reconnectedAgentResponse(): Response {
  return jsonResponse({
    agent: {
      participant_id: "ag-c92e",
      display_name: "Claude",
      runtime_id: "claude",
      active_session: SESSION.id,
      runtime_session: {
        desired_name: SESSION.id,
        native_name_applied: true,
      },
      managed: true,
      paused: false,
      connection_state: "connected",
      activity_state: "idle",
      tmux_session: "fmark-ag-c92e-reconnected",
      mcp_status: "installed",
      hook_status: "installed",
      context: {
        status: "not-reported",
        used_tokens: null,
        max_tokens: null,
        source: "not-reported",
      },
      access: {
        mode: "default",
        supported_modes: ["default"],
        change_supported: true,
      },
      pending_access_count: 0,
    },
  });
}

export function expectOnlyCurrentSessionAgent(container: HTMLElement): void {
  expect(agentChipIds(container)).toEqual(["ag-this"]);
}

export function expectNoHistoricalAgentChips(container: HTMLElement): void {
  expect(agentChips(container).length).toBe(0);
}

export function resetForSpawnedClaudeChip(): void {
  resetStore({
    envProbe: HEALTHY_PROBE,
    participants: userOnlyParticipants(),
  });
}

export function expectNoAgentChips(container: HTMLElement): void {
  expect(agentChips(container).length).toBe(0);
}

export function resetActiveAgent({
  state,
}: {
  state: "online" | "stale";
}): void {
  resetStore({
    events: [userTurnEndEvent()],
    managedAgents: [AGENTS[0]!],
    presence: { "ag-c92e": { state, last_hook_at: 1 } },
  });
}
