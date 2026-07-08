import { describe, expect, it, vi } from "vitest";
import {
  PinnedPortInUseError,
  listenOnPinnedPort,
} from "../../src/launch/listen.js";

describe("listenOnPinnedPort", () => {
  it("binds exactly once with the selected port", async () => {
    const app = {
      listen: vi.fn(async () => "http://localhost:7777"),
    };

    await listenOnPinnedPort(app, { port: 7777, host: "localhost" });

    expect(app.listen).toHaveBeenCalledTimes(1);
    expect(app.listen).toHaveBeenCalledWith({ port: 7777, host: "localhost" });
  });

  it("fails immediately on EADDRINUSE without trying the next port", async () => {
    const err = new Error("busy") as NodeJS.ErrnoException;
    err.code = "EADDRINUSE";
    const app = {
      listen: vi.fn(async () => {
        throw err;
      }),
    };

    await expect(
      listenOnPinnedPort(
        app,
        { port: 7777, host: "localhost" },
        { findListenerPids: vi.fn(async () => [2468]) },
      ),
    ).rejects.toThrow(PinnedPortInUseError);

    expect(app.listen).toHaveBeenCalledTimes(1);
    expect(app.listen).toHaveBeenCalledWith({ port: 7777, host: "localhost" });
  });
});
