import { readdir, readFile, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ForkedAgentResult,
  ForkSessionResponse,
  RuntimeEntry,
  RuntimeSessionInfo,
} from "@f-mark/shared";
import { isoTimestamp } from "@f-mark/shared";
import type { Paths } from "../../paths.js";
import { paths as makePaths } from "../../paths.js";
import { forkSessionFolder } from "../../sessions.js";
import {
  ensureSystemForkParticipant,
  listParticipants,
  registerForkAgentParticipant,
  type ParticipantWithSession,
} from "../../participants.js";
import { writeForkLinkPair } from "../../services/forkLinkWriter.js";
import {
  createAgentStateStore,
  type AgentStateStore,
} from "../../services/agentState.js";
import { loadRuntimeRegistry } from "../../runtimes/store.js";
import type { TmuxManager } from "../../tmux/manager.js";
import type { Bus } from "../../ws/bus.js";
import { validateWritableDirectory } from "../fs.js";
import { SessionPathResolver } from "./pathResolver.js";
import type {
  ForkSessionRouteBody,
  RouteResult,
  ScopedSessionPathsResult,
  SessionRouteDeps,
} from "./types.js";

type RuntimeRegistryEntries = Awaited<
  ReturnType<typeof loadRuntimeRegistry>
>["runtimes"];

type ForkRouteResult = RouteResult<ForkSessionResponse | { error: string }>;

interface SessionForkServiceInput {
  deps: SessionRouteDeps;
  getBus?: () => Bus;
  paths?: SessionPathResolver;
}

interface ForkAgentContext {
  participantId: string;
  participant: ParticipantWithSession;
  runtimeId: string | null;
}

interface ForkParticipantContext extends ForkAgentContext {
  forkParticipantId: string;
  sourceRuntimeSession: RuntimeSessionInfo | null;
}

interface ForkRuntimeCommand {
  args: string[];
  nativeCommand: string;
  nativeNameApplied: boolean;
  nativeParentSessionId: string | null;
  warning?: string;
}

export class SessionForkService {
  private readonly deps: SessionRouteDeps;
  private readonly getBus: (() => Bus) | undefined;
  private readonly pathResolver: SessionPathResolver;

  constructor(input: SessionForkServiceInput) {
    this.deps = input.deps;
    this.getBus = input.getBus;
    this.pathResolver = input.paths ?? new SessionPathResolver(input.deps);
  }

  async fork(input: {
    sourceSessionId: string;
    body: ForkSessionRouteBody;
  }): Promise<ForkRouteResult> {
    const scoped = await this.resolveForkPaths(input.body);
    if (!scoped.ok) return rootScopeError(scoped);
    const p = scoped.paths;
    const agentState = createAgentStateStore(this.deps);
    const participants = await this.safeListParticipants(p, agentState);
    const participantIds = requestedAgentIds(
      input.body,
      participants,
      input.sourceSessionId,
    );

    try {
      return {
        body: await this.performFork({
          p,
          sourceSessionId: input.sourceSessionId,
          body: input.body,
          participantIds,
          participants,
          agentState,
        }),
      };
    } catch (err) {
      return {
        status: /not found/i.test(errorMessage(err)) ? 404 : 400,
        body: { error: errorMessage(err) },
      };
    }
  }

  private async resolveForkPaths(
    body: ForkSessionRouteBody,
  ): Promise<ScopedSessionPathsResult> {
    if (hasRootScope(body)) return this.pathResolver.resolveScopedPaths(body);
    if (typeof body.path === "string" && body.path.length > 0) {
      const validated = await validateWritableDirectory(body.path);
      if (!validated.ok) {
        return { ok: false, status: validated.status, body: validated.body };
      }
      return { ok: true, paths: makePaths(validated.canonical) };
    }
    return { ok: true, paths: this.pathResolver.resolveListPaths() };
  }

  private async safeListParticipants(
    p: Paths,
    agentState: AgentStateStore,
  ): Promise<Record<string, ParticipantWithSession>> {
    try {
      return await listParticipants(p, { agentState });
    } catch {
      return {};
    }
  }

  private async performFork(input: {
    p: Paths;
    sourceSessionId: string;
    body: ForkSessionRouteBody;
    participantIds: string[];
    participants: Record<string, ParticipantWithSession>;
    agentState: AgentStateStore;
  }): Promise<ForkSessionResponse> {
    await ensureSystemForkParticipant(input.p);
    const forkInstantTs = isoTimestamp();
    const fork = await forkSessionFolder(input.p, {
      sourceSessionId: input.sourceSessionId,
      name: input.body.name,
      agentParticipantIds: input.participantIds,
    });
    await this.pathResolver.registerRoot(input.p.root());

    const linkWarnings = await this.writeForkLinks(
      input.p,
      input.sourceSessionId,
      fork.session.id,
      fork.session.slug,
      forkInstantTs,
    );
    const agents = await this.duplicateAgents(input, fork.session.id);
    const warnings = collectWarnings(agents, linkWarnings);
    const session = this.pathResolver.withPathMetadata(fork.session, input.p);
    this.getBus?.().publish({
      type: "session.forked",
      source_session_id: input.sourceSessionId,
      session,
      agents,
      warnings,
    });
    return {
      source_session_id: input.sourceSessionId,
      session,
      copied_entries: fork.copied_entries,
      agents,
      warnings,
    };
  }

  private async writeForkLinks(
    p: Paths,
    sourceSessionId: string,
    forkSessionId: string,
    forkSlug: string,
    timestamp: string,
  ): Promise<string[]> {
    const linkResults = await writeForkLinkPair({
      p,
      sourceSessionId,
      forkSessionId,
      sourceSlug: sourceSessionId.replace(/^\d{4}-\d{2}-\d{2}-/, ""),
      forkSlug,
      timestamp,
      bus: this.getBus?.() ?? null,
    });
    return forkLinkWarnings(linkResults);
  }

  private async duplicateAgents(
    input: {
      p: Paths;
      sourceSessionId: string;
      participantIds: string[];
      participants: Record<string, ParticipantWithSession>;
      agentState: AgentStateStore;
      body: ForkSessionRouteBody;
    },
    forkSessionId: string,
  ): Promise<ForkedAgentResult[]> {
    const shouldRelaunch = input.body.relaunch_agents !== false;
    const runtimeRegistry = shouldRelaunch
      ? await loadRuntimeRegistry({ fallback: input.p, ref: this.deps.ref })
      : null;
    return new ForkAgentDuplicator({
      p: input.p,
      sourceSessionId: input.sourceSessionId,
      forkSessionId,
      participantIds: input.participantIds,
      participants: input.participants,
      agentState: input.agentState,
      relaunchAgents: shouldRelaunch,
      tmux: shouldRelaunch ? this.deps.getTmuxManager?.() ?? null : null,
      runtimes: runtimeRegistry?.runtimes ?? {},
    }).duplicateAll();
  }
}

class ForkAgentDuplicator {
  private readonly commandBuilder = new ForkRuntimeCommandBuilder();

  constructor(
    private readonly input: {
      p: Paths;
      sourceSessionId: string;
      forkSessionId: string;
      participantIds: string[];
      participants: Record<string, ParticipantWithSession>;
      agentState: AgentStateStore;
      relaunchAgents: boolean;
      tmux: TmuxManager | null;
      runtimes: RuntimeRegistryEntries;
    },
  ) {}

  async duplicateAll(): Promise<ForkedAgentResult[]> {
    const out: ForkedAgentResult[] = [];
    for (const participantId of this.input.participantIds) {
      out.push(await this.duplicateOne(participantId));
    }
    return out;
  }

  private async duplicateOne(participantId: string): Promise<ForkedAgentResult> {
    const context = await this.contextFor(participantId);
    if ("result" in context) return context.result;

    try {
      const forkContext = await this.createForkParticipant(context);
      return await this.relaunchOrReport(forkContext);
    } catch (err) {
      return failureResult(context, errorMessage(err));
    }
  }

  private async contextFor(
    participantId: string,
  ): Promise<ForkAgentContext | { result: ForkedAgentResult }> {
    const participant = this.input.participants[participantId];
    if (participant === undefined || participant.kind !== "agent") {
      return { result: missingAgentResult(participantId) };
    }
    const runtimeId =
      participant.runtime_id ??
      (await this.input.agentState.readRuntime(participantId));
    if (participant.active_session !== this.input.sourceSessionId) {
      return { result: detachedAgentResult(participantId, participant, runtimeId) };
    }
    return { participantId, participant, runtimeId };
  }

  private async createForkParticipant(
    context: ForkAgentContext,
  ): Promise<ForkParticipantContext> {
    const control = await this.input.agentState.readControlState(
      context.participantId,
    );
    const sourceRuntimeSession = await this.input.agentState.readRuntimeSession(
      context.participantId,
    );
    const forkParticipant = await registerForkAgentParticipant(this.input.p, {
      sourceParticipantId: context.participantId,
      sourceSessionId: this.input.sourceSessionId,
      forkSessionId: this.input.forkSessionId,
    });

    await this.input.agentState.writeActiveSession(
      forkParticipant.id,
      this.input.forkSessionId,
    );
    if (context.runtimeId !== null) {
      await this.input.agentState.writeRuntime(forkParticipant.id, context.runtimeId);
    }
    await this.input.agentState.writeRuntimeSession(forkParticipant.id, {
      desired_name: this.input.forkSessionId,
      native_name_applied: false,
      native_parent_session_id: nativeParentSessionId(sourceRuntimeSession),
    });
    await this.input.agentState.writeControlState(forkParticipant.id, {
      ...control,
      activity_state: "idle",
      updated_at: new Date().toISOString(),
    });
    await this.logDuplicate(context.participantId);

    return {
      ...context,
      forkParticipantId: forkParticipant.id,
      sourceRuntimeSession,
    };
  }

  private async logDuplicate(participantId: string): Promise<void> {
    await this.input.agentState.appendLog(participantId, {
      event: this.input.relaunchAgents
        ? "fork-participant-duplicated"
        : "fork-participant-duplicated-no-relaunch",
      source_session: this.input.sourceSessionId,
      fork_session: this.input.forkSessionId,
      source_participant_id: participantId,
    });
  }

  private async relaunchOrReport(
    context: ForkParticipantContext,
  ): Promise<ForkedAgentResult> {
    if (!this.input.relaunchAgents) return duplicatedResult(context);
    const preflight = this.relaunchPreflight(context);
    if ("result" in preflight) return preflight.result;

    const command = await this.commandBuilder.build({
      p: this.input.p,
      runtimeId: context.runtimeId!,
      runtime: preflight.runtime,
      sourceSessionId: this.input.sourceSessionId,
      forkSessionId: this.input.forkSessionId,
      sourceRuntimeSession: context.sourceRuntimeSession,
    });
    if (command === null) return unsupportedRuntimeResult(context);
    if ("error" in command) return duplicatedResult(context, command.error);
    return this.launchForkRuntime(context, preflight.runtime, command);
  }

  private relaunchPreflight(
    context: ForkParticipantContext,
  ): { runtime: RuntimeEntry } | { result: ForkedAgentResult } {
    if (context.runtimeId === null) {
      return {
        result: duplicatedResult(
          context,
          "fork participant was created, but the source agent has no runtime id to launch",
        ),
      };
    }
    const runtime = this.input.runtimes[context.runtimeId];
    if (runtime === undefined) {
      return {
        result: duplicatedResult(
          context,
          `fork participant was created, but runtime ${context.runtimeId} is not configured`,
        ),
      };
    }
    if (this.input.tmux === null) {
      return {
        result: duplicatedResult(
          context,
          "fork participant was created, but no tmux manager is available to launch it",
        ),
      };
    }
    return { runtime };
  }

  private async launchForkRuntime(
    context: ForkParticipantContext,
    runtime: RuntimeEntry,
    command: ForkRuntimeCommand,
  ): Promise<ForkedAgentResult> {
    let sessionName: string | null = null;
    try {
      const spawned = await this.input.tmux!.spawnAgent({
        participantId: context.forkParticipantId,
        executable: runtime.executable,
        args: command.args,
        env: {
          ...(runtime.env ?? {}),
          F_MARK_RUNTIME_ID: context.runtimeId!,
          F_MARK_PATH: this.input.p.root(),
          F_MARK_SESSION_ID: this.input.forkSessionId,
        },
        projectRoot: this.input.p.root(),
      });
      sessionName = spawned.sessionName;
      await this.writeLaunchState(context, command, sessionName);
      return relaunchedResult(context, command, sessionName);
    } catch (err) {
      await this.killSpawnedSession(sessionName);
      return launchFailureResult(context, command, sessionName, errorMessage(err));
    }
  }

  private async writeLaunchState(
    context: ForkParticipantContext,
    command: ForkRuntimeCommand,
    sessionName: string,
  ): Promise<void> {
    await this.input.agentState.writeTmuxSession(
      context.forkParticipantId,
      sessionName,
    );
    await this.input.agentState.writeRuntimeSession(context.forkParticipantId, {
      desired_name: this.input.forkSessionId,
      native_name_applied: command.nativeNameApplied,
      native_parent_session_id: command.nativeParentSessionId,
    });
    await this.input.agentState.updateControlState(context.forkParticipantId, {
      activity_state: "running",
    });
    await this.input.agentState.appendLog(context.forkParticipantId, {
      event: "fork-runtime-launched",
      runtime: context.runtimeId,
      source_session: this.input.sourceSessionId,
      fork_session: this.input.forkSessionId,
      source_participant_id: context.participantId,
      tmux_session: sessionName,
      native_command: command.nativeCommand,
      native_parent_session_id: command.nativeParentSessionId,
    });
  }

  private async killSpawnedSession(sessionName: string | null): Promise<void> {
    if (sessionName === null) return;
    try {
      await this.input.tmux!.killSession(sessionName);
    } catch {
      // Preserve the original launch/write failure.
    }
  }
}

class ForkRuntimeCommandBuilder {
  private readonly codexRollouts = new CodexRolloutFinder();

  async build(input: {
    p: Paths;
    runtimeId: string;
    runtime: RuntimeEntry;
    sourceSessionId: string;
    forkSessionId: string;
    sourceRuntimeSession: RuntimeSessionInfo | null;
  }): Promise<ForkRuntimeCommand | { error: string } | null> {
    if (input.runtimeId === "claude") return this.claude(input);
    if (input.runtimeId === "codex") return this.codex(input);
    if (input.runtimeId === "opencode") return this.opencode(input);
    return null;
  }

  private claude(input: {
    runtime: RuntimeEntry;
    sourceSessionId: string;
    forkSessionId: string;
    sourceRuntimeSession: RuntimeSessionInfo | null;
  }): ForkRuntimeCommand {
    const nativeSourceId = input.sourceRuntimeSession?.native_session_id ?? null;
    const sourceHandle =
      nativeSourceId ??
      appliedNativeName(input.sourceRuntimeSession) ??
      input.sourceSessionId;
    const args = [
      ...input.runtime.args,
      "--resume",
      sourceHandle,
      "--fork-session",
      "--name",
      input.forkSessionId,
    ];
    return {
      args,
      nativeCommand: nativeCommand(input.runtime, args),
      nativeNameApplied: true,
      nativeParentSessionId: sourceHandle,
      ...missingNativeWarning(
        nativeSourceId,
        input.sourceRuntimeSession,
        "Claude native source id was unknown; launched fork using the F-Mark source session id as the resume handle",
      ),
    };
  }

  private async codex(input: {
    p: Paths;
    runtime: RuntimeEntry;
    sourceRuntimeSession: RuntimeSessionInfo | null;
  }): Promise<ForkRuntimeCommand | { error: string }> {
    const nativeSourceId = input.sourceRuntimeSession?.native_session_id ?? null;
    const sourceHandle =
      nativeSourceId ??
      (await this.codexRollouts.findLatestNativeSessionId(input.p, input.runtime));
    if (sourceHandle === null) {
      return {
        error:
          "Codex native source session id is unknown; cannot launch `codex fork` without a provider session id",
      };
    }
    const args = [...input.runtime.args, "fork", sourceHandle];
    return {
      args,
      nativeCommand: nativeCommand(input.runtime, args),
      nativeNameApplied: false,
      nativeParentSessionId: sourceHandle,
      ...(nativeSourceId === null
        ? {
            warning:
              "Codex source id was recovered from the latest local Codex session for this project",
          }
        : {}),
    };
  }

  private opencode(input: {
    runtime: RuntimeEntry;
    sourceSessionId: string;
    sourceRuntimeSession: RuntimeSessionInfo | null;
  }): ForkRuntimeCommand {
    const nativeSourceId = input.sourceRuntimeSession?.native_session_id ?? null;
    const sourceHandle =
      nativeSourceId ??
      input.sourceRuntimeSession?.desired_name ??
      input.sourceSessionId;
    const args = [...input.runtime.args, "run", "--session", sourceHandle, "--fork"];
    return {
      args,
      nativeCommand: nativeCommand(input.runtime, args),
      nativeNameApplied: false,
      nativeParentSessionId: sourceHandle,
      ...(nativeSourceId === null
        ? {
            warning:
              "Opencode native source id was unknown; launched fork using the F-Mark source session id as the session handle",
          }
        : {}),
    };
  }
}

class CodexRolloutFinder {
  async findLatestNativeSessionId(
    p: Paths,
    runtime: RuntimeEntry,
  ): Promise<string | null> {
    for (const file of await this.listRecentRollouts(this.sessionsRoot(runtime.env))) {
      const id = await this.readSessionMetaIdForCwd(file, p.root());
      if (id !== null) return id;
    }
    return null;
  }

  private sessionsRoot(env: Record<string, string> | undefined): string {
    const home =
      env?.CODEX_HOME ??
      process.env.CODEX_HOME ??
      join(process.env.HOME ?? homedir(), ".codex");
    return join(home, "sessions");
  }

  private async listRecentRollouts(root: string, limit = 50): Promise<string[]> {
    const found: Array<{ path: string; mtime: number }> = [];
    const pending: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

    while (pending.length > 0) {
      const current = pending.pop()!;
      if (current.depth > 4) continue;
      for (const entry of await safeReadDir(current.dir)) {
        const full = join(current.dir, entry.name);
        if (entry.isDirectory()) {
          pending.push({ dir: full, depth: current.depth + 1 });
        } else if (isRolloutFile(entry)) {
          await trackRolloutFile(found, full);
        }
      }
    }

    return found
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
      .map((entry) => entry.path);
  }

  private async readSessionMetaIdForCwd(
    file: string,
    cwd: string,
  ): Promise<string | null> {
    try {
      const raw = await readFile(file, "utf8");
      const firstLine = raw.split("\n").find((line) => line.trim().length > 0);
      if (firstLine === undefined) return null;
      const entry = JSON.parse(firstLine) as {
        type?: string;
        payload?: { id?: unknown; cwd?: unknown };
      };
      if (isMatchingSessionMeta(entry, cwd)) return entry.payload.id;
    } catch {
      // Malformed or unreadable Codex rollouts are ignored.
    }
    return null;
  }
}

async function safeReadDir(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function isRolloutFile(entry: Dirent): boolean {
  return (
    entry.isFile() &&
    entry.name.startsWith("rollout-") &&
    entry.name.endsWith(".jsonl")
  );
}

async function trackRolloutFile(
  found: Array<{ path: string; mtime: number }>,
  path: string,
): Promise<void> {
  try {
    const info = await stat(path);
    found.push({ path, mtime: info.mtimeMs });
  } catch {
    // Ignore files that disappear during the scan.
  }
}

function isMatchingSessionMeta(
  entry: {
    type?: string;
    payload?: { id?: unknown; cwd?: unknown };
  },
  cwd: string,
): entry is { type: "session_meta"; payload: { id: string; cwd: string } } {
  return (
    entry.type === "session_meta" &&
    entry.payload?.cwd === cwd &&
    typeof entry.payload.id === "string" &&
    entry.payload.id.length > 0
  );
}

function requestedAgentIds(
  body: ForkSessionRouteBody,
  participants: Record<string, ParticipantWithSession>,
  sourceSessionId: string,
): string[] {
  if (Array.isArray(body.agent_ids) && body.agent_ids.length > 0) {
    return body.agent_ids;
  }
  return Object.entries(participants)
    .filter(([, participant]) => participant.active_session === sourceSessionId)
    .map(([id]) => id);
}

function hasRootScope(body: ForkSessionRouteBody): boolean {
  return (
    (typeof body.path_id === "string" && body.path_id.length > 0) ||
    (typeof body.root === "string" && body.root.length > 0)
  );
}

function rootScopeError(
  scoped: Exclude<ScopedSessionPathsResult, { ok: true }>,
): ForkRouteResult {
  return {
    status: scoped.status,
    body: { error: errorBodyMessage(scoped.body) },
  };
}

function errorBodyMessage(body: unknown): string {
  if (body !== null && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
  }
  return String(body);
}

function forkLinkWarnings(linkResults: Awaited<ReturnType<typeof writeForkLinkPair>>): string[] {
  const warnings: string[] = [];
  if ("error" in linkResults.source) {
    warnings.push(`source fork-link write failed: ${linkResults.source.error}`);
  }
  if ("error" in linkResults.fork) {
    warnings.push(`fork fork-link write failed: ${linkResults.fork.error}`);
  }
  return warnings;
}

function collectWarnings(
  agents: ForkedAgentResult[],
  linkWarnings: string[],
): string[] {
  return [
    ...agents
      .map((agent) => agent.warning)
      .filter((warning): warning is string => warning !== undefined),
    ...linkWarnings,
  ];
}

function missingAgentResult(participantId: string): ForkedAgentResult {
  return {
    participant_id: participantId,
    runtime_id: null,
    display_name: participantId,
    status: "failed",
    warning: "agent participant not found",
  };
}

function detachedAgentResult(
  participantId: string,
  participant: ParticipantWithSession,
  runtimeId: string | null,
): ForkedAgentResult {
  return {
    participant_id: participantId,
    runtime_id: runtimeId,
    display_name: participant.name,
    status: "skipped-detached",
    warning: "agent is not linked to the source session",
  };
}

function duplicatedResult(
  context: ForkParticipantContext,
  warning?: string,
): ForkedAgentResult {
  return {
    participant_id: context.participantId,
    fork_participant_id: context.forkParticipantId,
    runtime_id: context.runtimeId,
    display_name: context.participant.name,
    status: "duplicated",
    tmux_session: null,
    native_command: null,
    ...(warning !== undefined ? { warning } : {}),
  };
}

function unsupportedRuntimeResult(context: ForkParticipantContext): ForkedAgentResult {
  return duplicatedResult(
    context,
    `fork participant was created, but runtime ${context.runtimeId} does not expose a native fork command`,
  );
}

function relaunchedResult(
  context: ForkParticipantContext,
  command: ForkRuntimeCommand,
  sessionName: string,
): ForkedAgentResult {
  return {
    participant_id: context.participantId,
    fork_participant_id: context.forkParticipantId,
    runtime_id: context.runtimeId,
    display_name: context.participant.name,
    status: "relaunched",
    tmux_session: sessionName,
    native_command: command.nativeCommand,
    native_parent_session_id: command.nativeParentSessionId,
    ...(command.warning !== undefined ? { warning: command.warning } : {}),
  };
}

function launchFailureResult(
  context: ForkParticipantContext,
  command: ForkRuntimeCommand,
  sessionName: string | null,
  warning: string,
): ForkedAgentResult {
  return {
    participant_id: context.participantId,
    fork_participant_id: context.forkParticipantId,
    runtime_id: context.runtimeId,
    display_name: context.participant.name,
    status: "failed",
    tmux_session: sessionName,
    native_command: command.nativeCommand,
    native_parent_session_id: command.nativeParentSessionId,
    warning,
  };
}

function failureResult(
  context: ForkAgentContext,
  warning: string,
): ForkedAgentResult {
  return {
    participant_id: context.participantId,
    runtime_id: context.runtimeId,
    display_name: context.participant.name,
    status: "failed",
    warning,
  };
}

function nativeParentSessionId(
  sourceRuntimeSession: RuntimeSessionInfo | null,
): string | null {
  return (
    sourceRuntimeSession?.native_session_id ??
    appliedNativeName(sourceRuntimeSession) ??
    null
  );
}

function appliedNativeName(
  sourceRuntimeSession: RuntimeSessionInfo | null,
): string | null {
  return sourceRuntimeSession?.native_name_applied === true
    ? sourceRuntimeSession.desired_name
    : null;
}

function nativeCommand(runtime: RuntimeEntry, args: string[]): string {
  return `${runtime.executable} ${args.join(" ")}`;
}

function missingNativeWarning(
  nativeSourceId: string | null,
  sourceRuntimeSession: RuntimeSessionInfo | null,
  warning: string,
): { warning?: string } {
  return nativeSourceId === null &&
    sourceRuntimeSession?.native_name_applied !== true
    ? { warning }
    : {};
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
