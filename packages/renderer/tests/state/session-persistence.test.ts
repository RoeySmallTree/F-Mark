import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { AnyEventRecord } from "@f-mark/shared";
import {
  LAST_FOCUSED_SESSION_STORAGE_KEY,
  persistedLastFocusedSession,
  useStore,
} from "../../src/state/store.js";

const EVENT = {
  filename: "20260609T000000Z_us-a7f3.turn-end.json",
  timestamp: "20260609T000000Z",
  participant_id: "us-a7f3",
  kind: "turn-end",
  payload: {},
} as AnyEventRecord;

describe("session focus persistence", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    useStore.setState({
      activePath: "/workspace/F-Mark",
      activePathId: "abc123abc123",
      currentSessionId: "session-a",
      events: [EVENT],
      viewMode: "document",
      rightTab: "files",
    });
  });

  afterEach(() => {
    globalThis.localStorage?.clear();
  });

  test("setCurrentSession persists last focused session for the active path", () => {
    useStore.getState().setCurrentSession("session-b");

    expect(
      persistedLastFocusedSession("abc123abc123", "/workspace/F-Mark"),
    ).toBe("session-b");
    const raw = globalThis.localStorage?.getItem(
      LAST_FOCUSED_SESSION_STORAGE_KEY,
    );
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)["id:abc123abc123"]).toBe("session-b");
    expect(useStore.getState().events).toEqual([]);
    expect(useStore.getState().viewMode).toBe("everything");
    expect(useStore.getState().rightTab).toBe("log");
  });
});
