export interface PortLaunchLogger {
  info?(message: string): void;
  warn?(message: string): void;
  error?(message: string): void;
}

export interface PortCleanupResult {
  cleaned: boolean;
  pids: number[];
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  error: Error | null;
}

export interface PortCleanupDeps {
  isPortListening?: (port: number, host: string) => Promise<boolean>;
  findListenerPids?: (port: number, host: string) => Promise<number[]>;
  signalProcess?: (pid: number, signal: NodeJS.Signals) => void | Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

export interface EnsurePortAvailableOptions {
  port: number;
  host: string;
  logger?: PortLaunchLogger;
  deps?: PortCleanupDeps;
  pollIntervalMs?: number;
  settleAttempts?: number;
}

export interface PortCleanupRuntime {
  isPortListening: (port: number, host: string) => Promise<boolean>;
  findListenerPids: (port: number, host: string) => Promise<number[]>;
  signalProcess: (pid: number, signal: NodeJS.Signals) => void | Promise<void>;
  sleep: (ms: number) => Promise<void>;
}
