import process from "node:process";
import {
  discoverListenerPids,
  isTcpPortListening,
} from "./listeners.js";
import type { PortCleanupDeps, PortCleanupRuntime } from "./types.js";

function signalProcess(pid: number, signal: NodeJS.Signals): void {
  process.kill(pid, signal);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createPortCleanupRuntime(
  deps: PortCleanupDeps | undefined,
): PortCleanupRuntime {
  return {
    isPortListening: deps?.isPortListening ?? isTcpPortListening,
    findListenerPids: deps?.findListenerPids ?? discoverListenerPids,
    signalProcess: deps?.signalProcess ?? signalProcess,
    sleep: deps?.sleep ?? sleep,
  };
}
