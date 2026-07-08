import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AnyEventRecord, SessionMeta } from "@f-mark/shared";
import { AppSocketController } from "../../src/app/AppSocketController.js";
import { eventsBaseKeyFor } from "../../src/state/eventsBaseKey.js";
import { mergeEvents as mergeEventRecords } from "../../src/state/mergeEvents.js";
import {
  advanceCursor,
  loadSessionEventsCursor,
  saveSessionEventsCursor,
} from "../../src/state/sessionEventsCursor.js";

const SESSION: SessionMeta = {
  id: "session-a",
  slug: "session-a",
  created_at: "2026-06-01T12:00:00.000Z",
  path: "/repo",
  path_id: "path-a",
};

function event(
  filename: string,
  payload: Record<string, unknown> = {},
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "us-a7f3",
    kind: "prose",
    payload: { content: filename, ...payload },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

function saveCursor(events: AnyEventRecord[], sessionId = SESSION.id): void {
  saveSessionEventsCursor(
    advanceCursor(undefined, events, "20260601T120001.000Z", {
      path_id: "path-a",
      path: "/repo",
      session_id: sessionId,
    }),
  );
}

interface ControllerState {
  activePath: string | null;
  activePathId: string | null;
  activeRevision: number;
  currentSessionId: string | null;
  selectedPath: string | null;
  selectedPathId: string | null;
  sessions: SessionMeta[];
  events: AnyEventRecord[];
  eventsBaseKey: string | null;
}

function controllerHarness(
  initialEvents: AnyEventRecord[],
  overrides: Partial<ControllerState> = {},
) {
  const baseKey = eventsBaseKeyFor({ pathId: "path-a" }, SESSION.id);
  let state: ControllerState = {
    activePath: "/repo",
    activePathId: "path-a",
    activeRevision: 1,
    currentSessionId: SESSION.id,
    selectedPath: "/repo",
    selectedPathId: "path-a",
    sessions: [SESSION],
    events: initialEvents,
    eventsBaseKey: baseKey,
    ...overrides,
  };
  const setEvents = vi.fn((events: AnyEventRecord[], nextBaseKey?: string | null) => {
    state = { ...state, events, eventsBaseKey: nextBaseKey ?? null };
  });
  const mergeEvents = vi.fn((delta: AnyEventRecord[], nextBaseKey: string) => {
    state = {
      ...state,
      events: mergeEventRecords(state.events, delta),
      eventsBaseKey: nextBaseKey,
    };
  });
  const controller = new AppSocketController({
    token: null,
    getState: () => state,
    setPathsState: vi.fn(),
    setSessions: vi.fn(),
    setParticipants: vi.fn(),
    setCurrentSession: vi.fn(),
    setEvents,
    mergeEvents,
    dispatchManagedAgentWsMessage: vi.fn(),
  });
  return {
    baseKey,
    controller,
    getState: () => state,
    mergeEvents,
    setEvents,
  };
}

describe("AppSocketController session event refresh", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    globalThis.localStorage?.clear();
  });

  test("event_added fetches since cursor and merges into a matching base", async () => {
    const base = event("20260601T120000Z_us-a7f3.prose.md");
    const delta = event("20260601T120002Z_us-a7f3.prose.md");
    saveCursor([base]);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "/sessions/session-a/events?path_id=path-a&since=20260601T120000.999Z",
      );
      return Promise.resolve(jsonResponse({ events: [delta] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { controller, getState, mergeEvents } = controllerHarness([base]);

    await controller.handleMessage({
      type: "event_added",
      session_id: SESSION.id,
      filename: delta.filename,
      kind: "prose",
      pathId: "path-a",
    });

    expect(mergeEvents).toHaveBeenCalledWith([delta], "path-a/session-a");
    expect(getState().events.map((item) => item.filename)).toEqual([
      base.filename,
      delta.filename,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("integrity failure clears cursor and full-resyncs the base", async () => {
    const base = event("20260601T120000Z_us-a7f3.prose.md");
    const missing = event("20260601T115959Z_us-a7f3.prose.md");
    const badDelta = event("20260601T120002Z_us-a7f3.prose.md", {
      supersedes: missing.filename,
    });
    saveCursor([base]);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("since=")) {
        return Promise.resolve(jsonResponse({ events: [badDelta] }));
      }
      return Promise.resolve(jsonResponse({ events: [missing, badDelta] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { controller, getState, mergeEvents, setEvents } = controllerHarness([
      base,
    ]);

    await controller.handleMessage({
      type: "event_added",
      session_id: SESSION.id,
      filename: badDelta.filename,
      kind: "prose",
      pathId: "path-a",
    });

    expect(mergeEvents).not.toHaveBeenCalled();
    expect(setEvents).toHaveBeenCalledWith([missing, badDelta], "path-a/session-a");
    expect(getState().events.map((item) => item.filename)).toEqual([
      missing.filename,
      badDelta.filename,
    ]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/sessions/session-a/events?path_id=path-a&since=20260601T120000.999Z",
      "/sessions/session-a/events?path_id=path-a",
    ]);
    expect(loadSessionEventsCursor("path-a", SESSION.id)).toBeDefined();
  });

  test("event_added full-resyncs an empty session before a matching base exists", async () => {
    const delta = event("20260601T120002Z_us-a7f3.prose.md");
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      expect(String(input)).toBe("/sessions/session-a/events?path_id=path-a");
      return Promise.resolve(jsonResponse({ events: [delta] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { controller, getState, mergeEvents, setEvents } = controllerHarness([], {
      eventsBaseKey: null,
    });

    await controller.handleMessage({
      type: "event_added",
      session_id: SESSION.id,
      filename: delta.filename,
      kind: "prose",
      pathId: "path-a",
    });

    expect(mergeEvents).not.toHaveBeenCalled();
    expect(setEvents).toHaveBeenCalledWith([delta], "path-a/session-a");
    expect(getState().events.map((item) => item.filename)).toEqual([delta.filename]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("reconnect backfill refreshes registry and current session events", async () => {
    const fresh = event("20260601T120010Z_us-a7f3.prose.md");
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/paths") {
        return Promise.resolve(
          jsonResponse({
            activePath: "/repo",
            activePathId: "path-a",
            activeRevision: 2,
            knownPaths: ["/repo"],
            favorites: [],
          }),
        );
      }
      if (url === "/sessions?scope=all") {
        return Promise.resolve(jsonResponse({ sessions: [SESSION] }));
      }
      if (url === "/participants?path_id=path-a") {
        return Promise.resolve(jsonResponse({ participants: {} }));
      }
      if (url === "/sessions/session-a/events?path_id=path-a") {
        return Promise.resolve(jsonResponse({ events: [fresh] }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { controller, getState, setEvents } = controllerHarness([], {
      eventsBaseKey: null,
    });

    await controller.backfillCurrentView();

    expect(setEvents).toHaveBeenCalledWith([fresh], "path-a/session-a");
    expect(getState().events.map((item) => item.filename)).toEqual([fresh.filename]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/paths",
      "/sessions?scope=all",
      "/participants?path_id=path-a",
      "/sessions/session-a/events?path_id=path-a",
    ]);
  });

  test("event_superseded refreshes once after debounce", async () => {
    vi.useFakeTimers();
    const base = event("20260601T120000Z_us-a7f3.prose.md");
    const delta = event("20260601T120002Z_us-a7f3.prose.md");
    saveCursor([base]);
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ events: [delta] })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { controller } = controllerHarness([base]);

    await controller.handleMessage({
      type: "event_superseded",
      session_id: SESSION.id,
      filename: delta.filename,
      pathId: "path-a",
    });
    await controller.handleMessage({
      type: "event_superseded",
      session_id: SESSION.id,
      filename: delta.filename,
      pathId: "path-a",
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(75);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  test("session.forked clears source and fork cursors", async () => {
    const source = event("20260601T120000Z_us-a7f3.prose.md");
    const forked = event("20260601T120001Z_us-a7f3.prose.md");
    saveCursor([source], "source-session");
    saveCursor([forked], "forked-session");
    const { controller } = controllerHarness([source]);

    await controller.handleMessage({
      type: "session.forked",
      source_session_id: "source-session",
      session: { id: "forked-session", path_id: "path-a" },
      pathId: "path-a",
    });

    expect(loadSessionEventsCursor("path-a", "source-session")).toBeUndefined();
    expect(loadSessionEventsCursor("path-a", "forked-session")).toBeUndefined();
  });
});
