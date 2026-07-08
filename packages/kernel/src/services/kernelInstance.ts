import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

const FMARK_ALLOW_MULTIPLE_KERNELS = "FMARK_ALLOW_MULTIPLE_KERNELS";
const FMARK_DEV_SUPERVISOR_PID = "FMARK_DEV_SUPERVISOR_PID";

const DEFAULT_STARTUP_LOCK_WAIT_MS = 5_000;
const DEFAULT_STARTUP_LOCK_STALE_MS = 15_000;
const DEFAULT_STARTUP_LOCK_POLL_MS = 100;
const DEFAULT_GRACEFUL_SHUTDOWN_WAIT_MS = 2_500;
const DEFAULT_HARD_KILL_WAIT_MS = 1_500;
const DEFAULT_SHUTDOWN_POLL_MS = 100;
const DEFAULT_HEALTH_TIMEOUT_MS = 1_000;

export interface KernelInstanceIdentity {
  instance_id: string;
  pid: number;
  config_root: string;
  project_root: string;
  path_id: string;
  host: string;
  port: number;
  version: string;
  started_at: string;
  dev_supervisor_pid?: number;
}

export type KernelInstanceRecord = KernelInstanceIdentity;

export interface KernelInstanceLogger {
  info?(message: string): void;
  warn?(message: string): void;
  error?(message: string): void;
}

export interface KernelStartupLock {
  lockDir: string;
  release(): Promise<void>;
}

export interface TerminatePreviousKernelResult {
  action:
    | "missing"
    | "invalid"
    | "current"
    | "different-config-root"
    | "dead"
    | "unconfirmed"
    | "terminated"
    | "hard-killed";
  record?: KernelInstanceRecord;
}

export interface KernelInstanceDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  isPidAlive?: (pid: number) => boolean | Promise<boolean>;
  signalProcess?: (pid: number, signal: NodeJS.Signals) => void | Promise<void>;
  hardKillProcess?: (pid: number) => void | Promise<void>;
  fetchHealth?: (record: KernelInstanceRecord) => Promise<unknown>;
}

interface LockOwner {
  lock_id: string;
  pid: number;
  started_at: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function errnoCode(err: unknown): string | null {
  return err instanceof Error && "code" in err
    ? String((err as NodeJS.ErrnoException).code)
    : null;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function allowMultipleKernels(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[FMARK_ALLOW_MULTIPLE_KERNELS] === "1";
}

export function parseDevSupervisorPid(
  value: string | undefined,
): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeKernelInstanceRecord(
  value: unknown,
): KernelInstanceRecord | null {
  if (!isObject(value)) return null;
  const {
    instance_id,
    pid,
    config_root,
    project_root,
    path_id,
    host,
    port,
    version,
    started_at,
    dev_supervisor_pid,
  } = value;
  if (
    !isString(instance_id) ||
    !isPositiveInteger(pid) ||
    !isString(config_root) ||
    !isString(project_root) ||
    !isString(path_id) ||
    !isString(host) ||
    !isPositiveInteger(port) ||
    port > 65_535 ||
    !isString(version) ||
    !isString(started_at)
  ) {
    return null;
  }
  if (
    dev_supervisor_pid !== undefined &&
    !isPositiveInteger(dev_supervisor_pid)
  ) {
    return null;
  }

  return {
    instance_id,
    pid,
    config_root,
    project_root,
    path_id,
    host,
    port,
    version,
    started_at,
    ...(dev_supervisor_pid !== undefined ? { dev_supervisor_pid } : {}),
  };
}

export async function readKernelInstanceRecord(
  file: string,
): Promise<KernelInstanceRecord | null> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    if (errnoCode(err) === "ENOENT") return null;
    throw err;
  }

  try {
    return normalizeKernelInstanceRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeKernelInstanceRecord(
  file: string,
  record: KernelInstanceRecord,
): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

export async function removeKernelInstanceRecordIfCurrent(
  file: string,
  current: Pick<KernelInstanceRecord, "instance_id" | "pid" | "config_root">,
): Promise<boolean> {
  const record = await readKernelInstanceRecord(file);
  if (
    record === null ||
    record.instance_id !== current.instance_id ||
    record.pid !== current.pid ||
    record.config_root !== current.config_root
  ) {
    return false;
  }
  try {
    await unlink(file);
    return true;
  } catch (err) {
    if (errnoCode(err) === "ENOENT") return false;
    throw err;
  }
}

function normalizeLockOwner(value: unknown): LockOwner | null {
  if (!isObject(value)) return null;
  const { lock_id, pid, started_at } = value;
  if (!isString(lock_id) || !isPositiveInteger(pid) || !isString(started_at)) {
    return null;
  }
  return { lock_id, pid, started_at };
}

async function readLockOwner(ownerFile: string): Promise<LockOwner | null> {
  try {
    return normalizeLockOwner(JSON.parse(await readFile(ownerFile, "utf8")));
  } catch {
    return null;
  }
}

async function lockAgeMs(
  lockDir: string,
  owner: LockOwner | null,
  now: number,
): Promise<number> {
  const ownerStarted = owner === null ? NaN : Date.parse(owner.started_at);
  if (Number.isFinite(ownerStarted)) return now - ownerStarted;
  try {
    const s = await stat(lockDir);
    return now - s.mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export class KernelStartupLockError extends Error {
  constructor(lockDir: string, waitMs: number) {
    super(
      `Could not acquire F-Mark kernel startup lock at ${lockDir} within ${waitMs}ms; refusing to launch a second kernel for the same config root.`,
    );
    this.name = "KernelStartupLockError";
  }
}

export async function acquireKernelStartupLock(
  lockDir: string,
  options: {
    waitMs?: number;
    staleMs?: number;
    pollMs?: number;
    deps?: KernelInstanceDeps;
    logger?: KernelInstanceLogger;
  } = {},
): Promise<KernelStartupLock> {
  const waitMs = options.waitMs ?? DEFAULT_STARTUP_LOCK_WAIT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STARTUP_LOCK_STALE_MS;
  const pollMs = options.pollMs ?? DEFAULT_STARTUP_LOCK_POLL_MS;
  const now = options.deps?.now ?? (() => Date.now());
  const sleep = options.deps?.sleep ?? sleepMs;
  const pidAlive = options.deps?.isPidAlive ?? isPidAlive;
  const ownerFile = join(lockDir, "owner.json");
  const owner: LockOwner = {
    lock_id: randomUUID(),
    pid: process.pid,
    started_at: new Date(now()).toISOString(),
  };
  const deadline = now() + waitMs;

  for (;;) {
    try {
      await mkdir(lockDir, { recursive: false });
      await writeFile(ownerFile, `${JSON.stringify(owner, null, 2)}\n`, "utf8");
      return {
        lockDir,
        release: async () => {
          const current = await readLockOwner(ownerFile);
          if (
            current?.lock_id === owner.lock_id &&
            current.pid === owner.pid
          ) {
            await rm(lockDir, { recursive: true, force: true });
          }
        },
      };
    } catch (err) {
      if (errnoCode(err) !== "EEXIST") throw err;
    }

    const currentOwner = await readLockOwner(ownerFile);
    const age = await lockAgeMs(lockDir, currentOwner, now());
    const ownerAlive =
      currentOwner !== null ? await pidAlive(currentOwner.pid) : false;
    if (!ownerAlive || age > staleMs) {
      options.logger?.warn?.(
        `Removing stale F-Mark kernel startup lock at ${lockDir}`,
      );
      await rm(lockDir, { recursive: true, force: true });
      continue;
    }

    if (now() >= deadline) throw new KernelStartupLockError(lockDir, waitMs);
    await sleep(Math.min(pollMs, Math.max(1, deadline - now())));
  }
}

function isPidAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return errnoCode(err) === "EPERM";
  }
}

function defaultSignalProcess(pid: number, signal: NodeJS.Signals): void {
  process.kill(pid, signal);
}

function execFileAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function defaultHardKillProcess(pid: number): Promise<void> {
  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"]);
      return;
    } catch {
      // Fall back to Node's signal path below when taskkill is unavailable.
    }
  }
  process.kill(pid, "SIGKILL");
}

export function healthUrlForRecord(record: KernelInstanceRecord): string {
  return `http://localhost:${record.port}/health`;
}

async function fetchHealth(
  record: KernelInstanceRecord,
  timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(healthUrlForRecord(record), {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function healthKernelMatchesRecord(
  health: unknown,
  record: KernelInstanceRecord,
  configRoot: string,
): boolean {
  if (!isObject(health) || !isObject(health.kernel)) return false;
  const kernel = health.kernel;
  return (
    kernel.instance_id === record.instance_id &&
    kernel.pid === record.pid &&
    kernel.config_root === configRoot
  );
}

export async function confirmKernelHealth(
  record: KernelInstanceRecord,
  configRoot: string,
  deps: Pick<KernelInstanceDeps, "fetchHealth"> = {},
): Promise<boolean> {
  const health = await (deps.fetchHealth ?? fetchHealth)(record);
  return healthKernelMatchesRecord(health, record, configRoot);
}

async function waitForPidExit(
  pid: number,
  options: {
    timeoutMs: number;
    pollMs: number;
    deps?: KernelInstanceDeps;
  },
): Promise<boolean> {
  const now = options.deps?.now ?? (() => Date.now());
  const sleep = options.deps?.sleep ?? sleepMs;
  const pidAlive = options.deps?.isPidAlive ?? isPidAlive;
  const deadline = now() + options.timeoutMs;

  for (;;) {
    if (!(await pidAlive(pid))) return true;
    if (now() >= deadline) return false;
    await sleep(Math.min(options.pollMs, Math.max(1, deadline - now())));
  }
}

export async function terminatePreviousKernelInstance(options: {
  instanceFile: string;
  configRoot: string;
  currentInstanceId: string;
  currentPid?: number;
  gracefulShutdownMs?: number;
  hardKillWaitMs?: number;
  pollMs?: number;
  deps?: KernelInstanceDeps;
  logger?: KernelInstanceLogger;
}): Promise<TerminatePreviousKernelResult> {
  const record = await readKernelInstanceRecord(options.instanceFile);
  if (record === null) {
    try {
      await readFile(options.instanceFile, "utf8");
      return { action: "invalid" };
    } catch (err) {
      if (errnoCode(err) === "ENOENT") return { action: "missing" };
      throw err;
    }
  }

  const currentPid = options.currentPid ?? process.pid;
  if (
    record.pid === currentPid ||
    record.instance_id === options.currentInstanceId
  ) {
    return { action: "current", record };
  }
  if (record.config_root !== options.configRoot) {
    return { action: "different-config-root", record };
  }

  const pidAlive = options.deps?.isPidAlive ?? isPidAlive;
  if (!(await pidAlive(record.pid))) {
    await removeKernelInstanceRecordIfCurrent(options.instanceFile, record);
    return { action: "dead", record };
  }

  if (
    !(await confirmKernelHealth(record, options.configRoot, {
      fetchHealth: options.deps?.fetchHealth,
    }))
  ) {
    options.logger?.warn?.(
      `Ignoring existing F-Mark kernel record for PID ${record.pid}: /health identity was unavailable or did not match this config root.`,
    );
    return { action: "unconfirmed", record };
  }

  options.logger?.info?.(
    `Terminating older F-Mark kernel PID ${record.pid} for config root ${record.config_root}`,
  );
  await (options.deps?.signalProcess ?? defaultSignalProcess)(
    record.pid,
    "SIGTERM",
  );

  const pollMs = options.pollMs ?? DEFAULT_SHUTDOWN_POLL_MS;
  if (
    await waitForPidExit(record.pid, {
      timeoutMs:
        options.gracefulShutdownMs ?? DEFAULT_GRACEFUL_SHUTDOWN_WAIT_MS,
      pollMs,
      deps: options.deps,
    })
  ) {
    return { action: "terminated", record };
  }

  if (
    !(await confirmKernelHealth(record, options.configRoot, {
      fetchHealth: options.deps?.fetchHealth,
    }))
  ) {
    throw new Error(
      `Older F-Mark kernel PID ${record.pid} did not exit after SIGTERM, and /health no longer confirms instance ${record.instance_id}; refusing to hard-kill an unconfirmed process.`,
    );
  }

  options.logger?.warn?.(
    `Older F-Mark kernel PID ${record.pid} did not exit after SIGTERM; sending hard kill after reconfirmed /health identity.`,
  );
  await (options.deps?.hardKillProcess ?? defaultHardKillProcess)(record.pid);

  if (
    !(await waitForPidExit(record.pid, {
      timeoutMs: options.hardKillWaitMs ?? DEFAULT_HARD_KILL_WAIT_MS,
      pollMs,
      deps: options.deps,
    }))
  ) {
    throw new Error(
      `Older F-Mark kernel PID ${record.pid} still appears alive after hard kill.`,
    );
  }

  return { action: "hard-killed", record };
}
