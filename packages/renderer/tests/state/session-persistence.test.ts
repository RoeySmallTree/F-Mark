import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { AnyEventRecord } from "@f-mark/shared";
import {
  LAST_FOCUSED_SESSION_STORAGE_KEY,
  persistedLastFocusedSession,
  preserveSelectedSessionRootMetadata,
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
      selectedPath: "/workspace/F-Mark",
      selectedPathId: "abc123abc123",
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

  test("setCurrentSession persists focus when the id is unchanged after a path switch", () => {
    useStore.setState({
      activePath: "/workspace/Other",
      activePathId: "def456def456",
      selectedPath: "/workspace/Other",
      selectedPathId: "def456def456",
      currentSessionId: "shared-session",
    });

    useStore.getState().setCurrentSession("shared-session");

    expect(
      persistedLastFocusedSession("def456def456", "/workspace/Other"),
    ).toBe("shared-session");
  });

  test("setSessions keeps the current cross-root session metadata", () => {
    const selected = {
      id: "2026-06-24-blocked-multi-tool",
      slug: "blocked-multi-tool",
      created_at: "2026-06-24T07:00:00Z",
      path: "/home/roey/workspace/CABAL/cabal-be",
      path_id: "cabal-path-id",
    };
    useStore.setState({
      sessions: [selected],
      currentSessionId: selected.id,
      selectedPath: "/home/roey/workspace/F-Mark",
      selectedPathId: "fmark-path-id",
      activePath: "/home/roey/workspace/F-Mark",
      activePathId: "fmark-path-id",
    });

    useStore.getState().setSessions([
      {
        id: "fmark-session",
        slug: "fmark-session",
        created_at: "2026-06-24T08:00:00Z",
      },
    ]);

    expect(useStore.getState().sessions).toEqual([
      {
        id: "fmark-session",
        slug: "fmark-session",
        created_at: "2026-06-24T08:00:00Z",
      },
      selected,
    ]);
    expect(useStore.getState().selectedPathId).toBe("cabal-path-id");
  });

  test("root metadata is restored when a plain refresh includes the selected id", () => {
    const selected = {
      id: "2026-06-24-blocked-multi-tool",
      slug: "old-slug",
      created_at: "2026-06-24T07:00:00Z",
      path: "/home/roey/workspace/CABAL/cabal-be",
      path_id: "cabal-path-id",
    };

    expect(
      preserveSelectedSessionRootMetadata(
        [
          {
            id: selected.id,
            slug: "renamed",
            created_at: selected.created_at,
          },
        ],
        selected,
      ),
    ).toEqual([
      {
        id: selected.id,
        slug: "renamed",
        created_at: selected.created_at,
        path: selected.path,
        path_id: selected.path_id,
      },
    ]);
  });
});
