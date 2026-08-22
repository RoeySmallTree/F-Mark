import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const deleteSession = vi.fn().mockResolvedValue(undefined);

vi.mock("../../api/client.js", () => ({
  createClient: () => ({ deleteSession }),
}));

import { useSessionDelete } from "./useSessionDelete";

const SESSION = { id: "s1", slug: "my-session", path: "/tmp/p" };

function inputWith(
  confirmDestructive: (r: unknown) => Promise<unknown>,
): Parameters<typeof useSessionDelete>[0] {
  return {
    confirmDestructive,
    activePath: "/tmp/p",
    activePathId: "p1",
    allSessions: [SESSION],
    currentSessionId: "s1",
    token: "t",
    closeContextMenu: vi.fn(),
    setAllSessions: vi.fn(),
    setCurrentSession: vi.fn(),
    setError: vi.fn(),
    refreshSelectedRootSessions: vi.fn().mockResolvedValue(undefined),
  } as unknown as Parameters<typeof useSessionDelete>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSessionDelete", () => {
  it("does not delete when the human cancels", async () => {
    const { result } = renderHook(() =>
      useSessionDelete(inputWith(async () => null)),
    );
    await act(async () => {
      await result.current(SESSION as never);
    });
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("deletes when the human accepts", async () => {
    const { result } = renderHook(() =>
      useSessionDelete(inputWith(async () => ({ action: "session.delete" }))),
    );
    await act(async () => {
      await result.current(SESSION as never);
    });
    expect(deleteSession).toHaveBeenCalledTimes(1);
  });

  it("tells the user the event log is destroyed", async () => {
    const confirmDestructive = vi.fn().mockResolvedValue(null);
    const { result } = renderHook(() =>
      useSessionDelete(inputWith(confirmDestructive)),
    );
    await act(async () => {
      await result.current(SESSION as never);
    });
    const request = confirmDestructive.mock.calls[0]?.[0] as { detail: string };
    expect(request.detail).toContain("event log");
  });
});
