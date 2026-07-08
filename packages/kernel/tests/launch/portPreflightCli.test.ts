import { describe, expect, it, vi } from "vitest";
import {
  parsePortPreflightArgs,
  runPortPreflightCli,
} from "../../src/launch/portPreflightCli.js";

function sink(): { output: () => string; write: (chunk: string) => boolean } {
  let text = "";
  return {
    output: () => text,
    write: (chunk: string) => {
      text += chunk;
      return true;
    },
  };
}

describe("port preflight CLI", () => {
  it("parses host and port flags", () => {
    expect(parsePortPreflightArgs(["--host", "0.0.0.0", "--port=9090"])).toEqual(
      {
        host: "0.0.0.0",
        port: 9090,
        help: false,
      },
    );
  });

  it("calls the shared cleanup helper for valid flags", async () => {
    const ensurePortAvailable = vi.fn(async () => ({ cleaned: false, pids: [] }));

    const code = await runPortPreflightCli(["--host", "localhost", "--port", "7777"], {
      ensurePortAvailable,
      logger: {},
    });

    expect(code).toBe(0);
    expect(ensurePortAvailable).toHaveBeenCalledWith({
      port: 7777,
      host: "localhost",
      logger: {},
    });
  });

  it("prints a loud error and exits nonzero when cleanup fails", async () => {
    const stderr = sink();
    const code = await runPortPreflightCli(["--port", "7777"], {
      stderr,
      logger: {},
      ensurePortAvailable: vi.fn(async () => {
        throw new Error("Port 7777 on localhost is still in use");
      }),
    });

    expect(code).toBe(1);
    expect(stderr.output()).toMatch(/Port preflight failed/);
    expect(stderr.output()).toMatch(/Port 7777/);
  });

  it("returns usage errors for invalid flags", async () => {
    const stderr = sink();
    const code = await runPortPreflightCli(["--port", "nope"], {
      stderr,
      logger: {},
    });

    expect(code).toBe(2);
    expect(stderr.output()).toMatch(/invalid port number/);
  });
});
