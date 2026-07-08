/* A cross-root fork must select the new session UNDER ITS OWN ROOT. Forking
   does not change the server's active path, so selecting the fork without its
   root would leave the store on the stale active project and the next agent
   spawn would 404 ("session not found"). Regression guard alongside the
   new-session flow fix. */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ForkSessionResponse } from "../../src/api/client.js";

const FORK_RESPONSE: ForkSessionResponse = {
  source_session_id: "2026-07-08-src",
  session: {
    id: "2026-07-08-fork01",
    slug: "topic-fork",
    created_at: "2026-07-08T12:00:00Z",
    path: "/workspace/Other",
    path_id: "otherpathid456",
  },
  copied_entries: 3,
  agents: [],
  warnings: [],
} as ForkSessionResponse;

const fakeClient = {
  forkSession: vi.fn(async () => FORK_RESPONSE),
  getPaths: vi.fn(async () => ({
    activePath: "/workspace/F-Mark",
    activePathId: "fmarkpathid123",
    activeRevision: 1,
    knownPaths: ["/workspace/F-Mark", "/workspace/Other"],
    favorites: [],
  })),
  listSessions: vi.fn(async () => []),
  listParticipants: vi.fn(async () => ({})),
};

vi.mock("../../src/api/client.js", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  createClient: () => fakeClient,
}));

vi.mock("../../src/api/managedAgents.js", () => ({
  createManagedAgentsClient: () => ({ status: vi.fn(async () => null) }),
}));

const { submitForkSession } = await import(
  "../../src/components/forkSessionPopover/actions.js"
);

afterEach(() => {
  vi.clearAllMocks();
});

describe("submitForkSession cross-root select", () => {
  it("selects the fork under its own root", async () => {
    const setCurrentSession = vi.fn();
    await submitForkSession({
      activePath: "/workspace/F-Mark",
      target: {
        id: "2026-07-08-src",
        slug: "topic",
        created_at: "2026-07-08T11:00:00Z",
      },
      name: "topic-fork",
      inputRef: { current: null },
      setBusy: vi.fn(),
      setError: vi.fn(),
      setResult: vi.fn(),
      onClose: vi.fn(),
      token: "t",
      setCurrentSession,
      setSessions: vi.fn(),
      setParticipants: vi.fn(),
      setPathsState: vi.fn(),
      setManagedAgents: vi.fn(),
    });

    expect(setCurrentSession).toHaveBeenCalledWith(
      "2026-07-08-fork01",
      expect.objectContaining({
        path: "/workspace/Other",
        path_id: "otherpathid456",
      }),
    );
  });
});
