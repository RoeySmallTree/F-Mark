import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentActivityState,
  ManagedAgentControlState,
  RuntimeSessionInfo,
} from "@f-mark/shared";
import {
  readActiveSession as readActiveSessionFile,
  writeActiveSession as writeActiveSessionFile,
} from "../agents/activeSession.js";
import {
  clearManagedSiblings as clearManagedSiblingsFiles,
  listManagedAgentIds as listManagedAgentIdsInDir,
  readRuntime as readRuntimeFile,
  readTmuxSession as readTmuxSessionFile,
  writeRuntime as writeRuntimeFile,
  writeTmuxSession as writeTmuxSessionFile,
} from "../agents/managed.js";
import {
  appendAgentLog as appendAgentLogFile,
  readAgentLog as readAgentLogFile,
  type AgentLogEntry,
} from "../agents/logs.js";
import type { Paths } from "../paths.js";
import type { PathContextRef } from "../paths/contextRef.js";
import { computePathId } from "../paths/identity.js";
import { globalPaths, resolveConfigRoot, type GlobalPaths } from "../paths/global.js";

function uniqueDirs(primary: string, legacy?: string): string[] {
  const dirs = [primary];
  if (legacy !== undefined && legacy !== primary) dirs.push(legacy);
  return dirs;
}

function defaultControlState(): ManagedAgentControlState {
  return {
    paused: false,
    activity_state: "idle",
    access_mode: "default",
  };
}

function parseActivityState(value: unknown): AgentActivityState {
  if (
    value === "idle" ||
    value === "running" ||
    value === "notified" ||
    value === "turn-ended" ||
    value === "access-pending"
  ) {
    return value;
  }
  return "idle";
}

function parseControlState(raw: string): ManagedAgentControlState {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const state = defaultControlState();
  if (typeof parsed.paused === "boolean") state.paused = parsed.paused;
  state.activity_state = parseActivityState(parsed.activity_state);
  if (typeof parsed.access_mode === "string" && parsed.access_mode.length > 0) {
    state.access_mode = parsed.access_mode;
  }
  if (typeof parsed.updated_at === "string" && parsed.updated_at.length > 0) {
    state.updated_at = parsed.updated_at;
  }
  return state;
}

export interface AgentStateStoreInput {
  primaryAgentsDir: string;
  legacyAgentsDir?: string;
}

export class AgentStateStore {
  private readonly primaryAgentsDir: string;
  private readonly dirs: string[];

  constructor(input: AgentStateStoreInput) {
    this.primaryAgentsDir = input.primaryAgentsDir;
    this.dirs = uniqueDirs(input.primaryAgentsDir, input.legacyAgentsDir);
  }

  primaryDir(): string {
    return this.primaryAgentsDir;
  }

  allDirs(): string[] {
    return [...this.dirs];
  }

  async readActiveSession(participantId: string): Promise<string | null> {
    for (const dir of this.dirs) {
      const value = await readActiveSessionFile(dir, participantId);
      if (value !== null) return value;
    }
    return null;
  }

  async writeActiveSession(
    participantId: string,
    sessionId: string,
  ): Promise<void> {
    for (const dir of this.dirs) {
      await writeActiveSessionFile(dir, participantId, sessionId);
    }
  }

  async readTmuxSession(participantId: string): Promise<string | null> {
    for (const dir of this.dirs) {
      const value = await readTmuxSessionFile(dir, participantId);
      if (value !== null) return value;
    }
    return null;
  }

  async writeTmuxSession(
    participantId: string,
    sessionName: string,
  ): Promise<void> {
    await writeTmuxSessionFile(this.primaryAgentsDir, participantId, sessionName);
  }

  async readRuntime(participantId: string): Promise<string | null> {
    for (const dir of this.dirs) {
      const value = await readRuntimeFile(dir, participantId);
      if (value !== null) return value;
    }
    return null;
  }

  async writeRuntime(participantId: string, runtimeId: string): Promise<void> {
    await writeRuntimeFile(this.primaryAgentsDir, participantId, runtimeId);
  }

  async readRuntimeSession(
    participantId: string,
  ): Promise<RuntimeSessionInfo | null> {
    for (const dir of this.dirs) {
      try {
        const raw = await readFile(
          join(dir, participantId, "runtime-session.json"),
          "utf8",
        );
        const parsed = JSON.parse(raw) as Partial<RuntimeSessionInfo>;
        if (
          (parsed.desired_name === null || typeof parsed.desired_name === "string") &&
          typeof parsed.native_name_applied === "boolean"
        ) {
          return {
            desired_name: parsed.desired_name,
            native_name_applied: parsed.native_name_applied,
          };
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
    }
    return null;
  }

  async writeRuntimeSession(
    participantId: string,
    value: RuntimeSessionInfo,
  ): Promise<void> {
    const dir = join(this.primaryAgentsDir, participantId);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "runtime-session.json"),
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
  }

  async readControlState(
    participantId: string,
  ): Promise<ManagedAgentControlState> {
    for (const dir of this.dirs) {
      try {
        return parseControlState(
          await readFile(join(dir, participantId, "state.json"), "utf8"),
        );
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
    }
    return defaultControlState();
  }

  async writeControlState(
    participantId: string,
    value: ManagedAgentControlState,
  ): Promise<void> {
    const dir = join(this.primaryAgentsDir, participantId);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "state.json"),
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
  }

  async updateControlState(
    participantId: string,
    patch: Partial<ManagedAgentControlState>,
  ): Promise<ManagedAgentControlState> {
    const current = await this.readControlState(participantId);
    const next: ManagedAgentControlState = {
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    await this.writeControlState(participantId, next);
    return next;
  }

  async readInboxCursor(
    participantId: string,
    sessionId: string,
  ): Promise<string | null> {
    for (const dir of this.dirs) {
      try {
        const raw = await readFile(
          join(dir, participantId, "inbox-cursors.json"),
          "utf8",
        );
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const value = parsed[sessionId];
        if (typeof value === "string" && value.length > 0) return value;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
    }
    return null;
  }

  async writeInboxCursor(
    participantId: string,
    sessionId: string,
    cursor: string,
  ): Promise<void> {
    const dir = join(this.primaryAgentsDir, participantId);
    await mkdir(dir, { recursive: true });
    const path = join(dir, "inbox-cursors.json");
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, string>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    parsed[sessionId] = cursor;
    await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  }

  async clearManagedSiblings(participantId: string): Promise<void> {
    for (const dir of this.dirs) {
      await clearManagedSiblingsFiles(dir, participantId);
    }
  }

  async listManagedAgentIds(): Promise<string[]> {
    const ids = new Set<string>();
    for (const dir of this.dirs) {
      for (const id of await listManagedAgentIdsInDir(dir)) ids.add(id);
    }
    return [...ids].sort();
  }

  async appendLog(
    participantId: string,
    entry: Omit<AgentLogEntry, "ts"> & { ts?: string },
  ): Promise<void> {
    await appendAgentLogFile(this.primaryAgentsDir, participantId, entry);
  }

  async readLog(
    participantId: string,
    opts: { limit?: number } = {},
  ): Promise<AgentLogEntry[]> {
    for (const dir of this.dirs) {
      const entries = await readAgentLogFile(dir, participantId, opts);
      if (entries.length > 0) return entries;
    }
    return [];
  }
}

export function createAgentStateStore(input: {
  fallback: Paths;
  ref?: PathContextRef;
}): AgentStateStore {
  const active = input.ref?.get().active ?? null;
  if (input.ref !== undefined && active !== null) {
    return new AgentStateStore({
      primaryAgentsDir: input.ref.global().projectAgentsDir(active.pathId()),
      legacyAgentsDir: join(active.fmarkDir(), "agents"),
    });
  }
  return new AgentStateStore({
    primaryAgentsDir: join(input.fallback.fmarkDir(), "agents"),
  });
}

export function createAgentStateStoreForAgentsDir(
  agentsDir: string,
): AgentStateStore {
  return new AgentStateStore({ primaryAgentsDir: agentsDir });
}

export function createHookAgentStateStore(input: {
  projectRoot: string;
  fmarkDir: string;
  env?: NodeJS.ProcessEnv;
  global?: GlobalPaths;
}): AgentStateStore {
  const g =
    input.global ??
    globalPaths(resolveConfigRoot(input.env ?? process.env));
  return new AgentStateStore({
    primaryAgentsDir: g.projectAgentsDir(computePathId(input.projectRoot)),
    legacyAgentsDir: join(input.fmarkDir, "agents"),
  });
}
