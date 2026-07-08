import { PortCleanupCoordinator } from "./portCleanup/coordinator.js";
import { createPortCleanupRuntime } from "./portCleanup/runtime.js";
import type {
  EnsurePortAvailableOptions,
  PortCleanupResult,
} from "./portCleanup/types.js";

export { PortCleanupFailedError } from "./portCleanup/errors.js";
export { discoverListenerPids } from "./portCleanup/listeners.js";
export { isTcpPortListening } from "./portCleanup/listeners.js";
export { formatListenerPids, parsePidList } from "./portCleanup/pids.js";
export type { CommandResult } from "./portCleanup/types.js";
export type { PortCleanupDeps } from "./portCleanup/types.js";
export type {
  EnsurePortAvailableOptions,
  PortCleanupResult,
  PortLaunchLogger,
} from "./portCleanup/types.js";

export async function ensurePortAvailableForLaunch(
  options: EnsurePortAvailableOptions,
): Promise<PortCleanupResult> {
  return new PortCleanupCoordinator(
    options,
    createPortCleanupRuntime(options.deps),
  ).ensureAvailable();
}
