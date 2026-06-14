import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { TopBar } from "../../src/shell/TopBar.js";
import { Feed } from "../../src/shell/Feed.js";
import {
  useStore,
  loadViewModeBySession,
  VIEW_MODE_STORAGE_KEY,
  type ViewMode,
} from "../../src/state/store.js";
import type { SessionMeta } from "../../src/api/client.js";
import { renderWithAgentSpawn } from "../agentSpawnProvider.js";

const SESSION_A: SessionMeta = {
  id: "2026-05-22-launch-planning",
  slug: "launch-planning",
  created_at: "2026-05-22T10:00:00Z",
};

const SESSION_B: SessionMeta = {
  id: "2026-05-22-retro",
  slug: "retro",
  created_at: "2026-05-22T11:00:00Z",
};

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-c92e": { kind: "agent", name: "Claude", color: "#b86a1f" },
};

function prose(
  filename: string,
  payload: { content: string; name?: string; target?: { file: string } },
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "us-a7f3",
    kind: "prose",
    payload,
  };
}

function choices(filename: string): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "us-a7f3",
    kind: "choices",
    payload: {
      id: "q1",
      question: "Pick?",
      options: [{ id: "a", label: "A" }],
      multi: false,
    },
  };
}

function turnEnd(filename: string): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "us-a7f3",
    kind: "turn-end",
    payload: { participant_id: "us-a7f3" },
  };
}

const NAMED = prose("20260522T000001Z_us-a7f3.prose.md", {
  content: "doc body",
  name: "Plan",
});
const UNNAMED = prose("20260522T000002Z_us-a7f3.prose.md", {
  content: "hello there",
});
const COMMENT = prose("20260522T000003Z_us-a7f3.prose.md", {
  content: "feedback",
  target: { file: NAMED.filename },
});
const CHOICES = choices("20260522T000004Z_us-a7f3.choices.json");
const TURN = turnEnd("20260522T000005Z_us-a7f3.turn-end.json");

const ALL_EVENTS: AnyEventRecord[] = [NAMED, UNNAMED, COMMENT, CHOICES, TURN];

function resetStore(overrides: Record<string, unknown> = {}): void {
  useStore.setState({
    token: null,
    sessions: [SESSION_A, SESSION_B],
    currentSessionId: SESSION_A.id,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: ALL_EVENTS,
    composeMode: "message",
    commentTarget: null,
    composeDraft: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    viewModeBySession: {},
    activeModal: null,
    activePopover: { key: null, anchorRect: null },
    ...overrides,
  });
}

describe("View toggle — clicking each TopBar button updates store.viewMode", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore();
  });
  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
  });

  test("clicking Document → setViewMode('document') in store", async () => {
    const user = userEvent.setup();
    renderWithAgentSpawn(<TopBar />);
    expect(useStore.getState().viewMode).toBe("everything");
    const tablist = screen.getByRole("tablist", { name: /feed view mode/i });
    const buttons = within(tablist).getAllByRole("tab");
    await user.click(buttons[1]!);
    expect(useStore.getState().viewMode).toBe("document");
  });

  test("clicking Conversation → setViewMode('conversation') in store", async () => {
    const user = userEvent.setup();
    renderWithAgentSpawn(<TopBar />);
    const tablist = screen.getByRole("tablist", { name: /feed view mode/i });
    const buttons = within(tablist).getAllByRole("tab");
    await user.click(buttons[2]!);
    expect(useStore.getState().viewMode).toBe("conversation");
  });

  test("clicking Everything → setViewMode('everything') in store", async () => {
    const user = userEvent.setup();
    resetStore({ viewMode: "document" });
    renderWithAgentSpawn(<TopBar />);
    const tablist = screen.getByRole("tablist", { name: /feed view mode/i });
    const buttons = within(tablist).getAllByRole("tab");
    await user.click(buttons[0]!);
    expect(useStore.getState().viewMode).toBe("everything");
  });
});

describe("View toggle — Feed renders the right slice for each mode", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore();
  });
  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
  });

  test("Everything: feed shows prose, comment activity, choices, and turn-end", () => {
    resetStore({ viewMode: "everything" });
    const { container } = renderWithAgentSpawn(<Feed />);
    const cards = container.querySelectorAll("[data-event-filename]");
    const filenames = Array.from(cards).map((el) =>
      el.getAttribute("data-event-filename"),
    );
    expect(filenames).toContain(NAMED.filename);
    expect(filenames).toContain(UNNAMED.filename);
    expect(filenames).toContain(COMMENT.filename);
    expect(filenames).toContain(CHOICES.filename);
    expect(filenames).toContain(TURN.filename);
  });

  test("Document: feed shows named prose only", () => {
    resetStore({ viewMode: "document" });
    const { container } = renderWithAgentSpawn(<Feed />);
    const cards = container.querySelectorAll("[data-event-filename]");
    const filenames = Array.from(cards).map((el) =>
      el.getAttribute("data-event-filename"),
    );
    expect(filenames).toEqual(expect.arrayContaining([NAMED.filename]));
    expect(filenames).not.toContain(UNNAMED.filename);
    expect(filenames).not.toContain(CHOICES.filename);
    expect(filenames).not.toContain(COMMENT.filename);
    expect(filenames).not.toContain(TURN.filename);
  });

  test("Conversation: feed shows unnamed prose, comments, choices, and turn-end", () => {
    resetStore({ viewMode: "conversation" });
    const { container } = renderWithAgentSpawn(<Feed />);
    const cards = container.querySelectorAll("[data-event-filename]");
    const filenames = Array.from(cards).map((el) =>
      el.getAttribute("data-event-filename"),
    );
    expect(filenames).toEqual(
      expect.arrayContaining([
        UNNAMED.filename,
        COMMENT.filename,
        CHOICES.filename,
        TURN.filename,
      ]),
    );
    expect(filenames).not.toContain(NAMED.filename);
  });
});

describe("View toggle — empty-state messages match the active view", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore({ events: [] });
  });
  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
  });

  test("Everything: shows the shared pixel loading animation", () => {
    resetStore({ events: [], viewMode: "everything" });
    renderWithAgentSpawn(<Feed />);
    expect(screen.queryByText(/start with/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/paste an invite/i)).not.toBeInTheDocument();

    const loading = screen.getByRole("status", { name: /loading/i });
    expect(loading).toHaveClass("loading-animation");
    expect(loading).toHaveClass("feed-empty-pixel-loading");
    const emptyState = loading.closest(".empty-state");
    expect(emptyState).toHaveClass("feed-empty-loading");
    expect(emptyState?.getAttribute("data-view")).toBe(
      "everything",
    );
    expect(
      emptyState?.querySelectorAll(".feed-empty-skeleton-card"),
    ).toHaveLength(0);
  });

  test("Document: shows the Named compose hint", () => {
    resetStore({ events: [], viewMode: "document" });
    renderWithAgentSpawn(<Feed />);
    const empty = screen.getByText(/no named contributions yet/i);
    expect(empty.closest(".empty-state")?.getAttribute("data-view")).toBe(
      "document",
    );
  });

  test("Conversation: shows the quick-prompt hint", () => {
    resetStore({ events: [], viewMode: "conversation" });
    renderWithAgentSpawn(<Feed />);
    const empty = screen.getByText(/no messages yet/i);
    expect(empty.closest(".empty-state")?.getAttribute("data-view")).toBe(
      "conversation",
    );
  });
});

describe("View toggle — per-session persistence", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetStore();
  });
  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
  });

  test("setViewMode mirrors into viewModeBySession[currentSessionId]", () => {
    resetStore();
    useStore.getState().setViewMode("document");
    const state = useStore.getState();
    expect(state.viewMode).toBe("document");
    expect(state.viewModeBySession[SESSION_A.id]).toBe("document");
  });

  test("setViewMode persists viewModeBySession to localStorage", () => {
    resetStore();
    useStore.getState().setViewMode("conversation");
    const raw = globalThis.localStorage?.getItem(VIEW_MODE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Record<string, ViewMode>;
    expect(parsed[SESSION_A.id]).toBe("conversation");
  });

  test("switching sessions restores the previously chosen viewMode for that session", () => {
    resetStore();
    /* Pick conversation on session A. */
    useStore.getState().setViewMode("conversation");
    /* Switch to B (defaults to everything). */
    useStore.getState().setCurrentSession(SESSION_B.id);
    expect(useStore.getState().viewMode).toBe("everything");
    /* Pick document on B. */
    useStore.getState().setViewMode("document");
    /* Switch back to A → should restore conversation. */
    useStore.getState().setCurrentSession(SESSION_A.id);
    expect(useStore.getState().viewMode).toBe("conversation");
    /* Switch back to B → should restore document. */
    useStore.getState().setCurrentSession(SESSION_B.id);
    expect(useStore.getState().viewMode).toBe("document");
  });

  test("switching to a session that was never set falls back to 'everything'", () => {
    resetStore({
      viewMode: "document",
      viewModeBySession: { [SESSION_A.id]: "document" },
    });
    useStore.getState().setCurrentSession("brand-new-session");
    expect(useStore.getState().viewMode).toBe("everything");
  });

  test("setCurrentSession(null) resets viewMode to 'everything'", () => {
    resetStore({
      viewMode: "document",
      viewModeBySession: { [SESSION_A.id]: "document" },
    });
    useStore.getState().setCurrentSession(null);
    expect(useStore.getState().viewMode).toBe("everything");
  });

  test("setCurrentSession clears events (preserving P4 behaviour)", () => {
    resetStore();
    expect(useStore.getState().events.length).toBeGreaterThan(0);
    useStore.getState().setCurrentSession(SESSION_B.id);
    expect(useStore.getState().events).toEqual([]);
  });

  test("loadViewModeBySession reads from localStorage on init", () => {
    globalThis.localStorage?.setItem(
      VIEW_MODE_STORAGE_KEY,
      JSON.stringify({ "session-x": "document", "session-y": "conversation" }),
    );
    const loaded = loadViewModeBySession();
    expect(loaded["session-x"]).toBe("document");
    expect(loaded["session-y"]).toBe("conversation");
  });

  test("loadViewModeBySession ignores invalid entries", () => {
    globalThis.localStorage?.setItem(
      VIEW_MODE_STORAGE_KEY,
      JSON.stringify({ "session-x": "bogus", "session-y": "document" }),
    );
    const loaded = loadViewModeBySession();
    expect(loaded["session-x"]).toBeUndefined();
    expect(loaded["session-y"]).toBe("document");
  });

  test("loadViewModeBySession returns {} on corrupted JSON", () => {
    globalThis.localStorage?.setItem(VIEW_MODE_STORAGE_KEY, "not-json[[[");
    expect(loadViewModeBySession()).toEqual({});
  });

  test("setViewMode with no currentSessionId does not write to localStorage", () => {
    resetStore({ currentSessionId: null });
    useStore.getState().setViewMode("document");
    expect(useStore.getState().viewMode).toBe("document");
    /* localStorage was not touched for the per-session map. */
    expect(
      globalThis.localStorage?.getItem(VIEW_MODE_STORAGE_KEY),
    ).toBeNull();
  });
});
