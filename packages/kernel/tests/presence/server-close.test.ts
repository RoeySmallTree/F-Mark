import { describe, it, expect, vi, afterEach } from "vitest";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { withTempProject } from "../helpers/tempdir.js";

describe("createServer presence ticker lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears the presence ticker on app.close()", async () => {
    await withTempProject(async (root) => {
      const setSpy = vi.spyOn(globalThis, "setInterval");
      const clearSpy = vi.spyOn(globalThis, "clearInterval");
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      await app.ready();

      // Find the presence interval handle: presence tick runs every 5000ms.
      let presenceHandle: unknown = undefined;
      for (let i = 0; i < setSpy.mock.calls.length; i += 1) {
        const args = setSpy.mock.calls[i];
        if (args[1] === 5_000) {
          presenceHandle = setSpy.mock.results[i]?.value;
          break;
        }
      }
      expect(presenceHandle, "presence ticker should be installed by createServer").toBeDefined();

      await app.close();

      // After close, clearInterval must have been invoked with the presence handle.
      const cleared = clearSpy.mock.calls.some((args) => args[0] === presenceHandle);
      expect(cleared).toBe(true);
    });
  });
});
