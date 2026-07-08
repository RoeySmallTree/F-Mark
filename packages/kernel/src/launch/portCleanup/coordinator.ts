import { PortCleanupFailedError } from "./errors.js";
import {
  formatListenerPids,
  signalablePids,
  uniquePids,
} from "./pids.js";
import { waitForPortClear } from "./polling.js";
import type {
  EnsurePortAvailableOptions,
  PortCleanupResult,
  PortCleanupRuntime,
  PortLaunchLogger,
} from "./types.js";

export class PortCleanupCoordinator {
  private readonly port: number;
  private readonly host: string;
  private readonly logger: PortLaunchLogger | undefined;
  private readonly pollIntervalMs: number;
  private readonly settleAttempts: number;

  constructor(
    options: EnsurePortAvailableOptions,
    private readonly runtime: PortCleanupRuntime,
  ) {
    this.port = options.port;
    this.host = options.host;
    this.logger = options.logger;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.settleAttempts = options.settleAttempts ?? 15;
  }

  async ensureAvailable(): Promise<PortCleanupResult> {
    if (!(await this.runtime.isPortListening(this.port, this.host))) {
      return { cleaned: false, pids: [] };
    }

    const initialPids = await this.findSignalablePids();
    if (initialPids.length === 0) this.fail("no-pids", []);

    await this.signalListeners("SIGTERM", initialPids);
    if (await this.waitUntilClear()) return this.cleaned(initialPids);

    const remainingPids = await this.findSignalablePids();
    if (remainingPids.length === 0) this.fail("still-busy", initialPids);

    await this.signalListeners("SIGKILL", remainingPids);
    if (await this.waitUntilClear()) {
      return this.cleaned(uniquePids([...initialPids, ...remainingPids]));
    }

    const finalPids = await this.findSignalablePids();
    this.fail("still-busy", finalPids.length > 0 ? finalPids : remainingPids);
  }

  private async findSignalablePids(): Promise<number[]> {
    return signalablePids(
      await this.runtime.findListenerPids(this.port, this.host),
    );
  }

  private async signalListeners(
    signal: NodeJS.Signals,
    pids: number[],
  ): Promise<void> {
    this.warn(this.signalMessage(signal, pids));
    for (const pid of pids) {
      await this.signalListener(pid, signal);
    }
  }

  private async signalListener(
    pid: number,
    signal: NodeJS.Signals,
  ): Promise<void> {
    try {
      await this.runtime.signalProcess(pid, signal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.warn(`Could not send ${signal} to PID ${pid}: ${msg}`);
    }
  }

  private async waitUntilClear(): Promise<boolean> {
    return waitForPortClear({
      port: this.port,
      host: this.host,
      isPortListening: this.runtime.isPortListening,
      sleep: this.runtime.sleep,
      pollIntervalMs: this.pollIntervalMs,
      settleAttempts: this.settleAttempts,
    });
  }

  private cleaned(pids: number[]): PortCleanupResult {
    return { cleaned: true, pids };
  }

  private signalMessage(signal: NodeJS.Signals, pids: number[]): string {
    return signal === "SIGTERM"
      ? this.sigtermMessage(pids)
      : this.sigkillMessage(pids);
  }

  private sigtermMessage(pids: number[]): string {
    return `Port ${this.port} is already in use; terminating listener PID(s): ${formatListenerPids(pids)}`;
  }

  private sigkillMessage(pids: number[]): string {
    return `Port ${this.port} is still in use; sending SIGKILL to listener PID(s): ${formatListenerPids(pids)}`;
  }

  private warn(message: string): void {
    this.logger?.warn?.(message);
  }

  private fail(
    reason: "no-pids" | "still-busy",
    pids: number[],
  ): never {
    throw new PortCleanupFailedError({
      port: this.port,
      host: this.host,
      pids,
      reason,
    });
  }
}
