import { afterEach, describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useConfirmDestructive } from "./useConfirmDestructive";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useConfirmDestructive", () => {
  it("returns a receipt when the human accepts", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = renderHook(() => useConfirmDestructive());
    const intent = await result.current({ action: "a.b", title: "Delete?" });
    expect(intent?.action).toBe("a.b");
  });

  it("returns null when the human cancels", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => useConfirmDestructive());
    expect(
      await result.current({ action: "a.b", title: "Delete?" }),
    ).toBeNull();
  });

  it("includes the detail line in the prompt", async () => {
    const spy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = renderHook(() => useConfirmDestructive());
    await result.current({
      action: "a.b",
      title: "Delete?",
      detail: "Gone forever.",
    });
    expect(spy.mock.calls[0]?.[0]).toContain("Gone forever.");
  });
});
