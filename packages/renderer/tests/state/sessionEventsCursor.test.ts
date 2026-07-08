import { beforeEach, describe, expect, test } from "vitest";
import type { AnyEventRecord } from "@f-mark/shared";
import {
  SESSION_EVENTS_CURSOR_STORAGE_KEY,
  advanceCursor,
  clearSessionEventsCursor,
  cursorMapKey,
  loadSessionEventsCursor,
  loadSessionEventsCursorMap,
  readSince,
  saveSessionEventsCursor,
} from "../../src/state/sessionEventsCursor.js";

function event(filename: string): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "us-a7f3",
    kind: "prose",
    payload: { content: filename },
  };
}

describe("session events cursor persistence", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
  });

  test("keys cursors by path id and session id", () => {
    expect(cursorMapKey("path-a", "session-a")).toBe("path-a/session-a");
  });

  test("loads, saves, and clears namespaced cursor entries", () => {
    saveSessionEventsCursor({
      schema: 1,
      path_id: "path-a",
      path: "/repo",
      session_id: "session-a",
      last_checked_at: "20260601T120000.000Z",
      last_seen_event_at: "20260601T115959Z",
    });

    expect(
      globalThis.localStorage?.getItem(SESSION_EVENTS_CURSOR_STORAGE_KEY),
    ).not.toBeNull();
    expect(loadSessionEventsCursor("path-a", "session-a")).toEqual({
      schema: 1,
      path_id: "path-a",
      path: "/repo",
      session_id: "session-a",
      last_checked_at: "20260601T120000.000Z",
      last_seen_event_at: "20260601T115959Z",
    });

    clearSessionEventsCursor("path-a", "session-a");

    expect(loadSessionEventsCursor("path-a", "session-a")).toBeUndefined();
  });

  test("subtracts one millisecond for incremental overlap", () => {
    expect(
      readSince({
        schema: 1,
        path_id: "path-a",
        path: "/repo",
        session_id: "session-a",
        last_checked_at: "20260601T120000.000Z",
      }),
    ).toBe("20260601T115959.999Z");
  });

  test("advances checked time and preserves latest seen event timestamp", () => {
    const advanced = advanceCursor(
      {
        schema: 1,
        path_id: "path-a",
        path: "/repo",
        session_id: "session-a",
        last_checked_at: "20260601T115959.000Z",
        last_seen_event_at: "20260601T115958Z",
      },
      [
        event("20260601T120001Z_us-a7f3.prose.md"),
        event("20260601T120000Z_us-a7f3.prose.md"),
      ],
      "20260601T120002.000Z",
      { path_id: "path-a", path: "/repo", session_id: "session-a" },
    );

    expect(advanced).toEqual({
      schema: 1,
      path_id: "path-a",
      path: "/repo",
      session_id: "session-a",
      last_checked_at: "20260601T120002.000Z",
      last_seen_event_at: "20260601T120001Z",
    });
  });

  test("ignores malformed persisted entries", () => {
    globalThis.localStorage?.setItem(
      SESSION_EVENTS_CURSOR_STORAGE_KEY,
      JSON.stringify({
        "path-a/session-a": {
          schema: 2,
          path_id: "path-a",
          path: "/repo",
          session_id: "session-a",
          last_checked_at: "20260601T120000Z",
        },
      }),
    );

    expect(loadSessionEventsCursorMap()).toEqual({});
  });
});
