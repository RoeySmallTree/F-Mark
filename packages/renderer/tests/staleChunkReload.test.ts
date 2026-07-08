import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  installStaleChunkReload,
  isDynamicImportError,
  reloadForStaleChunk,
} from "../src/staleChunkReload.js";

function stubReload(): ReturnType<typeof vi.fn> {
  const reload = vi.fn();
  vi.stubGlobal("location", { href: "http://localhost:7778/", reload });
  return reload;
}

describe("staleChunkReload", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("isDynamicImportError matches failed dynamic-import messages only", () => {
    expect(
      isDynamicImportError(
        new Error(
          "Failed to fetch dynamically imported module: http://x/TerminalOverlay-CPyJXRur.js",
        ),
      ),
    ).toBe(true);
    expect(
      isDynamicImportError(new Error("error loading dynamically imported module")),
    ).toBe(true);
    expect(isDynamicImportError(new Error("Loading chunk 5 failed."))).toBe(true);
    // Unrelated errors must NOT trigger a reload.
    expect(isDynamicImportError(new Error("x is not a function"))).toBe(false);
    expect(isDynamicImportError("nope")).toBe(false);
    expect(isDynamicImportError(null)).toBe(false);
  });

  test("reloadForStaleChunk reloads once, then the cooldown blocks repeats", () => {
    const reload = stubReload();
    reloadForStaleChunk();
    reloadForStaleChunk();
    reloadForStaleChunk();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("a vite:preloadError event self-heals via reload", () => {
    const reload = stubReload();
    installStaleChunkReload();
    window.dispatchEvent(new Event("vite:preloadError"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("an unhandled dynamic-import rejection self-heals; unrelated ones do not", () => {
    const reload = stubReload();
    installStaleChunkReload();

    const stale = new Event("unhandledrejection") as Event & { reason: unknown };
    stale.reason = new Error("Failed to fetch dynamically imported module: /x.js");
    window.dispatchEvent(stale);
    expect(reload).toHaveBeenCalledTimes(1);

    window.sessionStorage.clear(); // clear cooldown to prove the next is a no-op on its own merit
    const unrelated = new Event("unhandledrejection") as Event & {
      reason: unknown;
    };
    unrelated.reason = new Error("some other failure");
    window.dispatchEvent(unrelated);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
