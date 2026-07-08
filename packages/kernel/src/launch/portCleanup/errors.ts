import { formatListenerPids } from "./pids.js";

export class PortCleanupFailedError extends Error {
  readonly port: number;
  readonly host: string;
  readonly pids: number[];

  constructor(options: {
    port: number;
    host: string;
    pids: number[];
    reason: "no-pids" | "still-busy";
  }) {
    const pidText = formatListenerPids(options.pids);
    const reasonText =
      options.reason === "no-pids"
        ? "is in use, but no listener PID could be identified"
        : "is still in use after cleanup";
    super(
      `Port ${options.port} on ${options.host} ${reasonText}; refusing to auto-increment. Detected listener PIDs: ${pidText}. Stop that process or pass --port <n>.`,
    );
    this.name = "PortCleanupFailedError";
    this.port = options.port;
    this.host = options.host;
    this.pids = options.pids;
  }
}
