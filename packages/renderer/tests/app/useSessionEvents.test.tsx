import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AnyEventRecord, SessionMeta } from "@f-mark/shared";
import { useSessionEvents } from "../../src/app/useSessionEvents.js";
import { eventsBaseKeyFor } from "../../src/state/eventsBaseKey.js";
import {
  clearSessionEventsCache,
  setCachedEvents,
} from "../../src/state/sessionEventsCache.js";
import {
  advanceCursor,
  saveSessionEventsCursor,
} from "../../src/state/sessionEventsCursor.js";
import { useStore } from "../../src/state/store.js";

const SESSION: SessionMeta = {
  id: "session-a",
  slug: "session-a",
  created_at: "2026-06-01T12:00:00.000Z",
  path: "/repo",
  path_id: "path-a",
};

const SESSION_B: SessionMeta = {
  id: "session-b",
  slug: "session-b",
  created_at: "2026-06-01T12:05:00.000Z",
  path: "/repo",
  path_id: "path-a",
};

function event(filename: string, content: string): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "us-a7f3",
    kind: "prose",
    payload: { content },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

function Harness(): null {
  useSessionEvents(null);
  return null;
}

function resetStore(): void {
  useStore.setState({
    currentSessionId: SESSION.id,
    selectedPath: SESSION.path ?? null,
    selectedPathId: SESSION.path_id ?? null,
    sessions: [SESSION],
    events: [],
    eventsBaseKey: null,
    eventsLoadingSessionId: null,
  });
}

describe("useSessionEvents incremental loading", () => {
  beforeEach(() => {
    cleanup();
    clearSessionEventsCache();
    globalThis.localStorage?.clear();
    resetStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    clearSessionEventsCache();
    globalThis.localStorage?.clear();
  });

  test("cold reload full-fetches even when a cursor is persisted", async () => {
    const base = event("20260601T120000Z_us-a7f3.prose.md", "base");
    saveSessionEventsCursor(
      advanceCursor(
        undefined,
        [base],
        "20260601T120001.000Z",
        { path_id: "path-a", path: "/repo", session_id: SESSION.id },
      ),
    );
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      expect(String(input)).toBe("/sessions/session-a/events?path_id=path-a");
      return Promise.resolve(jsonResponse({ events: [base] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness />);

    await waitFor(() => {
      expect(useStore.getState().events).toEqual([base]);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("warm base fetches since the persisted cursor and merges the delta", async () => {
    const base = event("20260601T120000Z_us-a7f3.prose.md", "base");
    const delta = event("20260601T120002Z_us-a7f3.prose.md", "delta");
    const baseKey = eventsBaseKeyFor({ pathId: "path-a" }, SESSION.id);
    useStore.setState({ events: [base], eventsBaseKey: baseKey });
    saveSessionEventsCursor(
      advanceCursor(
        undefined,
        [base],
        "20260601T120001.000Z",
        { path_id: "path-a", path: "/repo", session_id: SESSION.id },
      ),
    );
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "/sessions/session-a/events?path_id=path-a&since=20260601T120000.999Z",
      );
      return Promise.resolve(jsonResponse({ events: [delta] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness />);

    await waitFor(() => {
      expect(useStore.getState().events.map((item) => item.filename)).toEqual([
        base.filename,
        delta.filename,
      ]);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("returning to a cached session after twenty minutes fetches missed events", async () => {
    const base = event("20260601T120000Z_us-a7f3.prose.md", "base");
    const missed = event("20260601T122000Z_us-a7f3.prose.md", "missed");
    const baseKey = eventsBaseKeyFor({ pathId: "path-a" }, SESSION.id);
    setCachedEvents(baseKey, [base]);
    useStore.setState({
      currentSessionId: SESSION_B.id,
      sessions: [SESSION, SESSION_B],
      events: [event("20260601T120500Z_us-a7f3.prose.md", "other")],
      eventsBaseKey: eventsBaseKeyFor({ pathId: "path-a" }, SESSION_B.id),
    });
    saveSessionEventsCursor(
      advanceCursor(
        undefined,
        [base],
        "20260601T120001.000Z",
        { path_id: "path-a", path: "/repo", session_id: SESSION.id },
      ),
    );
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "/sessions/session-a/events?path_id=path-a&since=20260601T120000.999Z",
      );
      return Promise.resolve(jsonResponse({ events: [missed] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    useStore.getState().setCurrentSession(SESSION.id, SESSION);
    render(<Harness />);

    await waitFor(() => {
      expect(useStore.getState().events.map((item) => item.filename)).toEqual([
        base.filename,
        missed.filename,
      ]);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
