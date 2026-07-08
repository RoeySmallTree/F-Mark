import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FMARK_MCP_INSTALL_VERSION } from "../mcpInstall/types.js";

const REGISTRY_FILENAME = "mcp-stdio-registry.json";

export interface FmarkMcpProcessRecord {
  id: string;
  pid: number;
  projectRoot: string;
  runtimeId: string | null;
  participantId: string | null;
  commandSpecVersion: string;
  startedAt: string;
}

export interface FmarkMcpProcessCleanupResult {
  killed_mcp_pids: number[];
  errors: string[];
}

export interface FmarkMcpProcessCleanupDeps {
  isAlive?(pid: number): boolean | Promise<boolean>;
  signal?(pid: number, signal: NodeJS.Signals): void | Promise<void>;
  wait?(ms: number): Promise<void>;
  termWaitMs?: number;
}

function registryPath(fmarkDir: string): string {
  return join(fmarkDir, REGISTRY_FILENAME);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeRecord(value: unknown): FmarkMcpProcessRecord | null {
  const record = asRecord(value);
  if (record === null) return null;
  if (
    typeof record.id !== "string" ||
    typeof record.pid !== "number" ||
    !Number.isSafeInteger(record.pid) ||
    record.pid <= 0 ||
    typeof record.projectRoot !== "string" ||
    typeof record.commandSpecVersion !== "string" ||
    typeof record.startedAt !== "string"
  ) {
    return null;
  }
  return {
    id: record.id,
    pid: record.pid,
    projectRoot: record.projectRoot,
    runtimeId: typeof record.runtimeId === "string" ? record.runtimeId : null,
    participantId:
      typeof record.participantId === "string" ? record.participantId : null,
    commandSpecVersion: record.commandSpecVersion,
    startedAt: record.startedAt,
  };
}

async function readRegistry(fmarkDir: string): Promise<FmarkMcpProcessRecord[]> {
  let raw: string;
  try {
    raw = await readFile(registryPath(fmarkDir), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) => normalizeRecord(entry))
    .filter((entry): entry is FmarkMcpProcessRecord => entry !== null);
}

async function writeRegistry(
  fmarkDir: string,
  records: FmarkMcpProcessRecord[],
): Promise<void> {
  const path = registryPath(fmarkDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function defaultWait(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function defaultSignal(pid: number, signal: NodeJS.Signals): void {
  process.kill(pid, signal);
}

function envString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

export async function registerFmarkMcpProcess(input: {
  fmarkDir: string;
  projectRoot: string;
  env: NodeJS.ProcessEnv;
  pid?: number;
  startedAt?: string;
}): Promise<{ id: string; unregister(): Promise<void> }> {
  const id = randomUUID();
  const record: FmarkMcpProcessRecord = {
    id,
    pid: input.pid ?? process.pid,
    projectRoot: input.projectRoot,
    runtimeId: envString(input.env.F_MARK_RUNTIME_ID),
    participantId: envString(input.env.F_MARK_AGENT_ID),
    commandSpecVersion:
      envString(input.env.F_MARK_MCP_VERSION) ?? FMARK_MCP_INSTALL_VERSION,
    startedAt: input.startedAt ?? new Date().toISOString(),
  };
  const records = await readRegistry(input.fmarkDir);
  records.push(record);
  await writeRegistry(input.fmarkDir, records);
  return {
    id,
    unregister: async () => {
      const current = await readRegistry(input.fmarkDir);
      await writeRegistry(
        input.fmarkDir,
        current.filter((entry) => entry.id !== id),
      );
    },
  };
}

export async function cleanupStaleFmarkMcpProcesses(input: {
  fmarkDir: string;
  projectRoot: string;
  runtimeId?: string;
  currentVersion?: string;
  deps?: FmarkMcpProcessCleanupDeps;
}): Promise<FmarkMcpProcessCleanupResult> {
  const currentVersion = input.currentVersion ?? FMARK_MCP_INSTALL_VERSION;
  const isAlive = input.deps?.isAlive ?? defaultIsAlive;
  const signal = input.deps?.signal ?? defaultSignal;
  const wait = input.deps?.wait ?? defaultWait;
  const termWaitMs = input.deps?.termWaitMs ?? 500;
  const errors: string[] = [];
  let records: FmarkMcpProcessRecord[];
  try {
    records = await readRegistry(input.fmarkDir);
  } catch (err) {
    return {
      killed_mcp_pids: [],
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  const killed = new Set<number>();
  const remaining: FmarkMcpProcessRecord[] = [];
  for (const record of records) {
    const targetRuntime =
      input.runtimeId === undefined ||
      record.runtimeId === input.runtimeId ||
      record.runtimeId === null;
    const stale =
      record.projectRoot === input.projectRoot &&
      targetRuntime &&
      record.commandSpecVersion !== currentVersion;
    if (!stale) {
      remaining.push(record);
      continue;
    }
    if (record.pid === process.pid) {
      errors.push(`refusing to signal current process pid ${record.pid}`);
      remaining.push(record);
      continue;
    }
    try {
      if (!(await isAlive(record.pid))) continue;
      await signal(record.pid, "SIGTERM");
      await wait(termWaitMs);
      if (await isAlive(record.pid)) {
        await signal(record.pid, "SIGKILL");
      }
      killed.add(record.pid);
    } catch (err) {
      errors.push(
        `failed to cleanup MCP pid ${record.pid}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      remaining.push(record);
    }
  }

  try {
    await writeRegistry(input.fmarkDir, remaining);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return { killed_mcp_pids: [...killed].sort((a, b) => a - b), errors };
}
