import { describe, expect, it, vi } from "vitest";
import {
  PortCleanupFailedError,
  ensurePortAvailableForLaunch,
  parsePidList,
} from "../../src/launch/portCleanup.js";

describe("port cleanup launch helper", () => {
  it("does not signal anything when the selected port is free", async () => {
    const findListenerPids = vi.fn(async () => [1234]);
    const signalProcess = vi.fn();

    const result = await ensurePortAvailableForLaunch({
      port: 7777,
      host: "localhost",
      deps: {
        isPortListening: vi.fn(async () => false),
        findListenerPids,
        signalProcess,
      },
    });

    expect(result).toEqual({ cleaned: false, pids: [] });
    expect(findListenerPids).not.toHaveBeenCalled();
    expect(signalProcess).not.toHaveBeenCalled();
  });

  it("sends SIGTERM to discovered listener PIDs and waits until the port is free", async () => {
    let listeningChecks = 0;
    const signalProcess = vi.fn();

    const result = await ensurePortAvailableForLaunch({
      port: 7777,
      host: "localhost",
      deps: {
        isPortListening: vi.fn(async () => {
          listeningChecks++;
          return listeningChecks === 1;
        }),
        findListenerPids: vi.fn(async () => [4321, 4321, process.pid]),
        signalProcess,
        sleep: vi.fn(async () => {}),
      },
      settleAttempts: 1,
    });

    expect(result).toEqual({ cleaned: true, pids: [4321] });
    expect(signalProcess).toHaveBeenCalledTimes(1);
    expect(signalProcess).toHaveBeenCalledWith(4321, "SIGTERM");
  });

  it("escalates to SIGKILL when a listener survives SIGTERM", async () => {
    const listeningStates = [true, true, true, true, false];
    const signalProcess = vi.fn();

    const result = await ensurePortAvailableForLaunch({
      port: 7777,
      host: "localhost",
      deps: {
        isPortListening: vi.fn(async () => listeningStates.shift() ?? false),
        findListenerPids: vi.fn(async () => [4321]),
        signalProcess,
        sleep: vi.fn(async () => {}),
      },
      settleAttempts: 1,
    });

    expect(result).toEqual({ cleaned: true, pids: [4321] });
    expect(signalProcess).toHaveBeenCalledWith(4321, "SIGTERM");
    expect(signalProcess).toHaveBeenCalledWith(4321, "SIGKILL");
  });

  it("throws loudly when the port is busy but no listener PID is discoverable", async () => {
    await expect(
      ensurePortAvailableForLaunch({
        port: 7777,
        host: "localhost",
        deps: {
          isPortListening: vi.fn(async () => true),
          findListenerPids: vi.fn(async () => []),
          signalProcess: vi.fn(),
        },
      }),
    ).rejects.toThrow(PortCleanupFailedError);

    await expect(
      ensurePortAvailableForLaunch({
        port: 7777,
        host: "localhost",
        deps: {
          isPortListening: vi.fn(async () => true),
          findListenerPids: vi.fn(async () => []),
          signalProcess: vi.fn(),
        },
      }),
    ).rejects.toThrow(/Detected listener PIDs: none/);
  });

  it("ignores invalid PID discovery output", () => {
    expect(parsePidList("abc 0 -1 12 12 pid=99 100x\n345")).toEqual([
      12,
      345,
    ]);
  });
});
