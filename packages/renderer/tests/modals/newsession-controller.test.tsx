/* Creating a session in a folder OTHER than the currently-active project must
   leave the store's selection pointing at the NEW session's root — that
   selection is what `spawnRootScope` derives from. Regression guard for the
   "POST /managed-agents/spawn -> 404: session not found" that happened when
   the fresh session was selected without its root, so the spawn targeted the
   stale active project (which does not contain the new session). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useStore } from "../../src/state/store.js";

const NEW_SESSION = {
  id: "2026-07-08-3475df",
  slug: "new-session",
  created_at: "2026-07-08T12:00:00Z",
  path: "/workspace/Other",
  path_id: "otherpathid456",
};

const fakeClient = {
  fsHome: vi.fn(async () => ({ home: "/workspace/Other" })),
  createSession: vi.fn(async () => NEW_SESSION),
  /* The unscoped list is served from the STILL-active old project, so it does
     not contain the freshly created session. */
  listSessions: vi.fn(async () => []),
  listParticipants: vi.fn(async () => ({})),
  /* Creating a session does not change the server's active path (registerRoot
     is MRU-only), so getPaths keeps reporting the old project. */
  getPaths: vi.fn(async () => ({
    activePath: "/workspace/F-Mark",
    activePathId: "fmarkpathid123",
    activeRevision: 1,
    knownPaths: ["/workspace/F-Mark", "/workspace/Other"],
    favorites: [],
  })),
};

vi.mock("../../src/api/client.js", () => ({
  createClient: () => fakeClient,
}));

const { useNewSessionController } = await import(
  "../../src/modals/newsession/useNewSessionController.js"
);

describe("useNewSessionController cross-root create", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    useStore.setState({
      token: "t",
      activePath: "/workspace/F-Mark",
      activePathId: "fmarkpathid123",
      selectedPath: "/workspace/F-Mark",
      selectedPathId: "fmarkpathid123",
      currentSessionId: null,
      sessions: [],
    });
  });

  afterEach(() => {
    cleanup();
    globalThis.localStorage?.clear();
  });

  it("selects the new session under its own root, not the stale active project", async () => {
    const { result } = renderHook(() => useNewSessionController());

    act(() => result.current.setFolder("/workspace/Other"));
    await act(async () => {
      await result.current.createSession();
    });

    const state = useStore.getState();
    expect(state.currentSessionId).toBe(NEW_SESSION.id);
    expect(state.selectedPath).toBe("/workspace/Other");
    expect(state.selectedPathId).toBe("otherpathid456");
  });
});
