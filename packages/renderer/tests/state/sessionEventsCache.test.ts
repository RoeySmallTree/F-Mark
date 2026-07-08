import { beforeEach, describe, expect, test } from "vitest";
import type { AnyEventRecord } from "@f-mark/shared";
import { eventsBaseKeyFor } from "../../src/state/eventsBaseKey.js";
import {
  clearSessionEventsCache,
  getCachedEvents,
  setCachedEvents,
} from "../../src/state/sessionEventsCache.js";
import { useStore } from "../../src/state/store.js";

function event(filename: string): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "us-a7f3",
    kind: "prose",
    payload: { content: filename },
  };
}

describe("sessionEventsCache", () => {
  beforeEach(() => {
    clearSessionEventsCache();
    useStore.setState({
      currentSessionId: "old-session",
      selectedPath: "/repo",
      selectedPathId: "path-a",
      sessions: [
        {
          id: "session-a",
          slug: "session-a",
          created_at: "2026-06-01T12:00:00.000Z",
          path: "/repo",
          path_id: "path-a",
        },
      ],
      events: [],
      eventsBaseKey: null,
      eventsLoadingSessionId: null,
    });
  });

  test("returns copies so callers cannot mutate cached entries", () => {
    const item = event("20260601T120000Z_us-a7f3.prose.md");
    setCachedEvents("path-a/session-a", [item]);

    getCachedEvents("path-a/session-a")!.push(
      event("20260601T120001Z_us-a7f3.prose.md"),
    );

    expect(getCachedEvents("path-a/session-a")).toEqual([item]);
  });

  test("evicts least recently used entries after eight bases", () => {
    for (let index = 0; index < 8; index += 1) {
      setCachedEvents(`base-${index}`, [
        event(`20260601T12000${index}Z_us-a7f3.prose.md`),
      ]);
    }
    expect(getCachedEvents("base-0")).toBeDefined();

    setCachedEvents("base-8", [
      event("20260601T120008Z_us-a7f3.prose.md"),
    ]);

    expect(getCachedEvents("base-0")).toBeDefined();
    expect(getCachedEvents("base-1")).toBeUndefined();
  });

  test("setCurrentSession restores cached events for the target base key", () => {
    const item = event("20260601T120000Z_us-a7f3.prose.md");
    const baseKey = eventsBaseKeyFor({ pathId: "path-a" }, "session-a");
    setCachedEvents(baseKey, [item]);

    useStore.getState().setCurrentSession("session-a");

    expect(useStore.getState().events).toEqual([item]);
    expect(useStore.getState().eventsBaseKey).toBe(baseKey);
    expect(useStore.getState().eventsLoadingSessionId).toBeNull();
  });
});
