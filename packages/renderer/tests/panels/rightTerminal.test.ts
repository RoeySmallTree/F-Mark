/* BL4 — killing a terminal is destructive (the shell and everything running
   in it end immediately, no undo). close() must gate the kill request behind
   useConfirmDestructive: a declined confirmation must not call the kill
   endpoint, an accepted one must. */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useStore } from "../../src/state/store.js";
import { useRightTerminalController } from "../../src/panels/right/terminal/useRightTerminalController.js";
import { jsonResponse } from "../cards/_helpers.js";

const SESSION = "tmux-1";

function resetStore(): void {
  useStore.setState({
    token: "tok",
    activePathId: "project-id",
    managedTerminals: [{ tmux_session: SESSION, label: "Terminal 1", index: 0 }],
    managedAgentsDisabledReason: null,
  });
}

function killTerminalFetchMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/managed-agents/terminal") && init?.method === "DELETE") {
      return Promise.resolve(jsonResponse({ status: "ok" }));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

describe("useRightTerminalController — close() confirmation gate (BL4)", () => {
  beforeEach(resetStore);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    cleanup();
  });

  test("declined confirmation does not call killTerminal", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = killTerminalFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const hook = renderHook(() => useRightTerminalController());
    hook.result.current.close(SESSION);

    // Give any stray microtask a chance to run before asserting the negative.
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().managedTerminals).toHaveLength(1);
  });

  test("accepted confirmation calls killTerminal with the session id", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = killTerminalFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const hook = renderHook(() => useRightTerminalController());
    hook.result.current.close(SESSION);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/managed-agents/terminal");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ tmux_session: SESSION });

    await waitFor(() =>
      expect(useStore.getState().managedTerminals).toHaveLength(0),
    );
  });
});
