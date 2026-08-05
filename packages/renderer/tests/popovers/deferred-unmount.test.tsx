/* useDeferredUnmount observes an `isOpen` boolean rather than intercepting a
   close callback, so every close path — raw setter, store setter, toggle,
   orchestrator — flips the same flag and gets the exit animation for free. */

import { afterEach, describe, expect, test } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useDeferredUnmount } from "../../src/popovers/useDeferredUnmount.js";

afterEach(() => {
  cleanup();
});

describe("useDeferredUnmount", () => {
  test("stays mounted and closing after isOpen flips false, then unmounts", async () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useDeferredUnmount(isOpen),
      { initialProps: { isOpen: true } },
    );

    expect(result.current.mounted).toBe(true);
    expect(result.current.closing).toBe(false);

    rerender({ isOpen: false });

    expect(result.current.mounted).toBe(true);
    expect(result.current.closing).toBe(true);

    await waitFor(
      () => {
        expect(result.current.mounted).toBe(false);
      },
      { timeout: 1000 },
    );
    expect(result.current.closing).toBe(false);
  });

  test("re-opening mid-exit cancels the unmount", async () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useDeferredUnmount(isOpen),
      { initialProps: { isOpen: true } },
    );

    rerender({ isOpen: false });
    expect(result.current.closing).toBe(true);

    rerender({ isOpen: true });
    expect(result.current.mounted).toBe(true);
    expect(result.current.closing).toBe(false);

    /* Hold past the original exit window — the cancelled timer must not
       fire and unmount a popover that reopened. */
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(result.current.mounted).toBe(true);
  });
});
