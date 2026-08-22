/* M5 — a stale error from a previous rename attempt must clear the moment
   a new rename attempt begins, not linger through a successful one. */

import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { SessionMeta } from "../../src/api/client.js";
import { useSessionRename } from "../../src/panels/sessions/useSessionRename.js";
import { jsonResponse } from "../cards/_helpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const SESSION: SessionMeta = {
  id: "2026-05-22-launch-review",
  slug: "launch-review",
  created_at: "2026-05-22T10:00:00Z",
};

function makeHarness(setError: (error: string | null) => void) {
  return renderHook(() =>
    useSessionRename({
      activePath: null,
      closeContextMenu: vi.fn(),
      currentSessionId: SESSION.id,
      refreshSelectedRootSessions: vi.fn().mockResolvedValue(undefined),
      setAllSessions: vi.fn(),
      setCurrentSession: vi.fn(),
      setError,
      token: null,
    }),
  );
}

describe("useSessionRename", () => {
  test("clears a previous error the moment a successful rename begins", async () => {
    let currentError: string | null = "Session name must use lowercase letters, numbers, and hyphens.";
    const setError = vi.fn((error: string | null) => {
      currentError = error;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ...SESSION, slug: "renamed" })),
    );

    const hook = makeHarness(setError);
    act(() => {
      hook.result.current.setRenameValue("renamed");
    });

    await act(async () => {
      await hook.result.current.saveRename(SESSION);
    });

    await waitFor(() => {
      expect(currentError).toBeNull();
    });
    /* First call of the attempt must be the clear, not the (absent) failure. */
    expect(setError.mock.calls[0]).toEqual([null]);
  });
});
