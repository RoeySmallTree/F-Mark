import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentActivityState,
  AgentRemovedReason,
  AgentSessionMembership,
  ManagedAgentControlState,
  RuntimeSessionInfo,
} from "@f-mark/shared";
import {
  clearActiveSession as clearActiveSessionFile,
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
  if (
    typeof parsed.last_activity_at === "string" &&
    parsed.last_activity_at.length > 0
  ) {
    state.last_activity_at = parsed.last_activity_at;
  }
  if (
    typeof parsed.last_tmux_activity_at === "string" &&
    parsed.last_tmux_activity_at.length > 0
  ) {
    state.last_tmux_activity_at = parsed.last_tmux_activity_at;
  }
  if (
    parsed.idle_stopped_at === null ||
    (typeof parsed.idle_stopped_at === "string" &&
      parsed.idle_stopped_at.length > 0)
  ) {
    state.idle_stopped_at = parsed.idle_stopped_at;
  }
  if (
    parsed.idle_stop_reason === null ||
    parsed.idle_stop_reason === "idle-timeout"
  ) {
    state.idle_stop_reason = parsed.idle_stop_reason;
  }
  if (
    parsed.last_tmux_session === null ||
    (typeof parsed.last_tmux_session === "string" &&
      parsed.last_tmux_session.length > 0)
  ) {
    state.last_tmux_session = parsed.last_tmux_session;
  }
  if (
    parsed.pane_lifecycle === "live" ||
    parsed.pane_lifecycle === "detached" ||
    parsed.pane_lifecycle === "idle-stopped" ||
    parsed.pane_lifecycle === "dead" ||
    parsed.pane_lifecycle === "no-pane"
  ) {
    state.pane_lifecycle = parsed.pane_lifecycle;
  }
  return state;
}

type RemovedMembershipFile = Record<
  string,
  Omit<AgentSessionMembership, "participant_id" | "state">
>;

function definedRuntimeSessionPatch(
  patch: Partial<RuntimeSessionInfo>,
): Partial<RuntimeSessionInfo> {
  const out: Partial<RuntimeSessionInfo> = {};
  if (patch.desired_name !== undefined) out.desired_name = patch.desired_name;
  if (patch.native_name_applied !== undefined) {
    out.native_name_applied = patch.native_name_applied;
  }
  if (patch.native_session_id !== undefined) {
    out.native_session_id = patch.native_session_id;
  }
  if (patch.native_parent_session_id !== undefined) {
    out.native_parent_session_id = patch.native_parent_session_id;
  }
  if (patch.native_transcript_path !== undefined) {
    out.native_transcript_path = patch.native_transcript_path;
  }
  if (patch.native_id_source !== undefined) {
    out.native_id_source = patch.native_id_source;
  }
  return out;
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

  async clearActiveSession(participantId: string): Promise<void> {
    for (const dir of this.dirs) {
      await clearActiveSessionFile(dir, participantId);
    }
  }

  async readRemovedMembership(
    participantId: string,
    sessionId: string,
  ): Promise<AgentSessionMembership | null> {
    for (const dir of this.dirs) {
      const file = await this.readRemovedMembershipFile(dir, participantId);
      const entry = file[sessionId];
      if (entry !== undefined) {
        return {
          participant_id: participantId,
          state: "removed",
          ...entry,
          session_id: entry.session_id ?? sessionId,
        };
      }
    }
    return null;
  }

  async markSessionRemoved(
    participantId: string,
    input: {
      sessionId: string;
      runtimeId: string | null;
      reason: AgentRemovedReason;
      lastTmuxSession?: string | null;
      removedAt?: string;
    },
  ): Promise<AgentSessionMembership> {
    const removedAt = input.removedAt ?? new Date().toISOString();
    const membership: AgentSessionMembership = {
      participant_id: participantId,
      session_id: input.sessionId,
      state: "removed",
      runtime_id: input.runtimeId,
      removed_at: removedAt,
      removed_reason: input.reason,
      last_tmux_session: input.lastTmuxSession ?? null,
    };
    for (const dir of this.dirs) {
      const current = await this.readRemovedMembershipFile(dir, participantId);
      current[input.sessionId] = {
        session_id: input.sessionId,
        runtime_id: input.runtimeId,
        removed_at: removedAt,
        removed_reason: input.reason,
        last_tmux_session: input.lastTmuxSession ?? null,
      };
      await this.writeRemovedMembershipFile(dir, participantId, current);
    }
    return membership;
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
          const value: RuntimeSessionInfo = {
            desired_name: parsed.desired_name,
            native_name_applied: parsed.native_name_applied,
          };
          if (
            parsed.native_session_id === null ||
            typeof parsed.native_session_id === "string"
          ) {
            value.native_session_id = parsed.native_session_id;
          }
          if (
            parsed.native_parent_session_id === null ||
            typeof parsed.native_parent_session_id === "string"
          ) {
            value.native_parent_session_id = parsed.native_parent_session_id;
          }
          if (
            parsed.native_transcript_path === null ||
            typeof parsed.native_transcript_path === "string"
          ) {
            value.native_transcript_path = parsed.native_transcript_path;
          }
          if (
            parsed.native_id_source === null ||
            parsed.native_id_source === "spawn-storage" ||
            parsed.native_id_source === "hook" ||
            parsed.native_id_source === "recovered-storage" ||
            parsed.native_id_source === "fork-storage" ||
            parsed.native_id_source === "manual"
          ) {
            value.native_id_source = parsed.native_id_source;
          }
          return value;
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

  async mergeRuntimeSession(
    participantId: string,
    patch: Partial<RuntimeSessionInfo>,
  ): Promise<RuntimeSessionInfo> {
    const current =
      (await this.readRuntimeSession(participantId)) ??
      ({
        desired_name: null,
        native_name_applied: false,
      } satisfies RuntimeSessionInfo);
    const next: RuntimeSessionInfo = {
      ...current,
      ...definedRuntimeSessionPatch(patch),
    };
    await this.writeRuntimeSession(participantId, next);
    return next;
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

  private async readRemovedMembershipFile(
    agentsDir: string,
    participantId: string,
  ): Promise<RemovedMembershipFile> {
    try {
      const raw = await readFile(
        join(agentsDir, participantId, "removed-memberships.json"),
        "utf8",
      );
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: RemovedMembershipFile = {};
      for (const [sessionId, value] of Object.entries(parsed)) {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          continue;
        }
        const entry = value as Record<string, unknown>;
        const storedSessionId =
          typeof entry.session_id === "string" && entry.session_id.length > 0
            ? entry.session_id
            : sessionId;
        const runtimeId =
          entry.runtime_id === null || typeof entry.runtime_id === "string"
            ? entry.runtime_id
            : null;
        const removedAt =
          typeof entry.removed_at === "string" && entry.removed_at.length > 0
            ? entry.removed_at
            : undefined;
        const removedReason =
          entry.removed_reason === "goodbye" ||
          entry.removed_reason === "migration" ||
          entry.removed_reason === "user"
            ? entry.removed_reason
            : undefined;
        const lastTmuxSession =
          entry.last_tmux_session === null ||
          typeof entry.last_tmux_session === "string"
            ? entry.last_tmux_session
            : null;
        out[sessionId] = {
          session_id: storedSessionId,
          runtime_id: runtimeId,
          ...(removedAt !== undefined ? { removed_at: removedAt } : {}),
          ...(removedReason !== undefined ? { removed_reason: removedReason } : {}),
          last_tmux_session: lastTmuxSession,
        };
      }
      return out;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw err;
    }
  }

  private async writeRemovedMembershipFile(
    agentsDir: string,
    participantId: string,
    value: RemovedMembershipFile,
  ): Promise<void> {
    const dir = join(agentsDir, participantId);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "removed-memberships.json"),
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
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

/* Root-scoped agent state (expansion-decisions.md X2). Binds to an explicit
   project root rather than the active path so wake/presence on a BACKGROUND
   root reads the right agents. Mirrors createAgentStateStore's layout: the
   primary store lives under the global projects dir keyed by the root's
   pathId, bridging back to the legacy per-root .f-mark/agents dir. When no
   global is wired (legacy single-path tests), fall back to the per-root dir. */
export function createAgentStateStoreForRoot(
  root: string,
  global?: GlobalPaths,
): AgentStateStore {
  const legacyAgentsDir = join(root, ".f-mark", "agents");
  if (global !== undefined) {
    return new AgentStateStore({
      primaryAgentsDir: global.projectAgentsDir(computePathId(root)),
      legacyAgentsDir,
    });
  }
  return new AgentStateStore({ primaryAgentsDir: legacyAgentsDir });
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
