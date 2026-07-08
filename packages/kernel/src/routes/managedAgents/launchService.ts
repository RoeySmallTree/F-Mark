import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentStatusRow,
  IntegrationApplyResponse,
  IntegrationScope,
  IntegrationStatus,
  ManagedAgentControlResponse,
  RuntimeOverridePatch,
  RuntimeSessionInfo,
  SpawnRequest,
} from "@f-mark/shared";
import { isPlaceholderSessionSlug } from "@f-mark/shared";
import { buildCompassPacket, sessionRenameNudge } from "../../compass/packet.js";
import { readEvents } from "../../events/reader.js";
import type { checkHookInstallStatus } from "../../hooksInstall/index.js";
import { markFmarkLaunchPrompt } from "../../launchPrompt.js";
import type { applyIntegration } from "../../mcpInstall/index.js";
import { preflightIntegration } from "../../mcpInstall/index.js";
import {
  defaultScope,
  hookInstallScopeFor,
  resolveChosenScope,
  writeLaunchDefaults,
} from "../../mcpInstall/scopePreference.js";
import {
  isValidParticipantId,
  listParticipants,
  registerAgent,
  setParticipantOverrides,
  setParticipantRuntime,
} from "../../participants.js";
import type { PathContextRef } from "../../paths/contextRef.js";
import { globalPaths, resolveConfigRoot } from "../../paths/global.js";
import type { Paths } from "../../paths.js";
import type { PresenceTracker } from "../../presence/tracker.js";
import {
  RuntimeModelValidationError,
  validateRuntimeModelPatch,
} from "../../runtimes/modelValidation.js";
import { loadRuntimeRegistry } from "../../runtimes/store.js";
import type { AgentStateStore } from "../../services/agentState.js";
import { resolveActiveTheme } from "../../services/theme.js";
import { readSessionSlug, sessionExists } from "../../sessions.js";
import type { InputQueue } from "../../tmux/inputQueue.js";
import type { TmuxManager } from "../../tmux/manager.js";
import type { Bus } from "../../ws/bus.js";
import { buildMcpGuide } from "../guide.js";
import { resolveRequestedAccessMode } from "./runtimeAccess.js";
import { spawnArgsForRuntime } from "./runtimeArgs.js";
import type { ManagedAgentRootBinding } from "./types.js";

type SpawnSetupStatus = IntegrationStatus | "unknown";
type HookStatusCheck = typeof checkHookInstallStatus;
type ApplyIntegrationInput = Parameters<typeof applyIntegration>[0];

type RouteResult<T> = {
  ok?: false;
  status: number;
  body: T;
};

type ErrorBody = { error: string };

type SpawnBody =
  | ErrorBody
  | {
      participant_id: string;
      tmux_session: string;
      runtime_id: string;
      active_session: string | null;
      path_id?: string;
      root?: string;
      mcp_status: SpawnSetupStatus;
      hooks_status: SpawnSetupStatus;
      runtime_session: RuntimeSessionInfo;
    };

type ControlBody = ManagedAgentControlResponse | ErrorBody;

interface ManagedAgentLaunchServiceDeps {
  fallbackPaths: Paths;
  pathContextRef?: PathContextRef;
  tmux: TmuxManager;
  tracker: PresenceTracker;
  inputQueue: InputQueue;
  bus: Bus;
  hookStatusCheck: HookStatusCheck;
  integrationEnv: NodeJS.ProcessEnv;
  ensureLaunchProjectConnection(p: Paths): Promise<void>;
  firstUserParticipantId(p: Paths): Promise<string | undefined>;
  applyIntegrationWithManagedCleanup(
    input: ApplyIntegrationInput & {
      p: Paths;
      state: AgentStateStore;
    },
  ): Promise<IntegrationApplyResponse>;
  buildStatusRow(
    participantId: string,
    binding?: ManagedAgentRootBinding | null,
  ): Promise<AgentStatusRow | null>;
  publishAgentUpdated(
    participantId: string,
    binding?: ManagedAgentRootBinding | null,
  ): Promise<void>;
  scheduleTerminalAccessPolling(input: {
    participantId: string;
    runtimeId: string | null;
    binding?: ManagedAgentRootBinding | null;
  }): void;
  scheduleCodexLiveTextPolling(input: {
    participantId: string;
    sessionId: string | null | undefined;
    runtimeId: string | null | undefined;
    binding?: ManagedAgentRootBinding | null;
    reset?: boolean;
  }): void;
}

interface RuntimeSetupInput {
  runtimeId: string;
  executable: string;
  participantId: string;
  userParticipantId?: string;
  binding: ManagedAgentRootBinding;
}

function randomizedDisplayName(displayName: string): string {
  return `${displayName} ${randomBytes(2).toString("hex")}`;
}

function blockedIntegrationCheck(
  projectRoot: string,
  reason: string,
): {
  status: "blocked";
  locations: Array<{
    scope: "project";
    path: string;
    status: "blocked";
    reason: string;
    safe_auto_apply: false;
  }>;
} {
  return {
    status: "blocked",
    locations: [
      {
        scope: "project",
        path: projectRoot,
        status: "blocked",
        reason,
        safe_auto_apply: false,
      },
    ],
  };
}

export async function preflightRegisteredIntegration(input: {
  runtimeId: string;
  participantId?: string;
  userParticipantId?: string;
  projectRoot: string;
  chosenScope?: IntegrationScope;
  registryDeps: { fallback: Paths; ref?: PathContextRef };
  env?: NodeJS.ProcessEnv;
}) {
  const runtimes = await loadRuntimeRegistry(input.registryDeps);
  const runtime = runtimes.runtimes[input.runtimeId];
  if (runtime === undefined) {
    const reason = `runtime_id is not registered for launch: ${input.runtimeId}`;
    const blocked = blockedIntegrationCheck(input.projectRoot, reason);
    return {
      runtime: {
        runtime_id: input.runtimeId,
        executable: input.runtimeId,
        available: false,
        reason,
      },
      mcp: blocked,
      hooks: blocked,
      chosen_scope: input.chosenScope ?? defaultScope(input.runtimeId),
      can_apply: false,
    };
  }
  return preflightIntegration({
    runtimeId: input.runtimeId,
    executable: runtime.executable,
    participantId: input.participantId,
    userParticipantId: input.userParticipantId,
    projectRoot: input.projectRoot,
    chosenScope: input.chosenScope,
    env: input.env ?? process.env,
  });
}

/**
 * Absolute path to `packages/renderer/src`, resolved from this compiled
 * module's location — kernel depth differs between dev (`src`) and bundled
 * installs, so probe a candidate list (same approach as routes/static.ts).
 * Null when the renderer source isn't present (e.g. a published install that
 * ships only the built bundle). Surfaced on the launch packet as
 * `renderer_source_root` so an agent mocking F-Mark's own UI reads the real
 * components instead of guessing paths.
 */
const RENDERER_SOURCE_ROOT: string | null = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "..", "..", "..", "..", "renderer", "src"),
    join(here, "..", "..", "..", "..", "..", "renderer", "src"),
    join(here, "..", "..", "..", "renderer", "src"),
  ]) {
    if (existsSync(join(candidate, "main.tsx"))) return candidate;
  }
  return null;
})();

export function buildLaunchPrompt(input: {
  sessionId?: string;
  sessionSlug?: string;
  participantId: string;
  userParticipantId: string;
  runtimeId: string;
  projectRoot: string;
  mcpStatus: SpawnSetupStatus;
  hooksStatus: SpawnSetupStatus;
  recentEvents?: Awaited<ReturnType<typeof readEvents>>;
}): string {
  const guide = buildMcpGuide({
    sessionId: input.sessionId,
    agentId: input.participantId,
    runtimeId: input.runtimeId,
    userParticipantId: input.userParticipantId,
    existingSession:
      input.sessionId !== undefined && (input.recentEvents?.length ?? 0) > 0,
  }).trim();
  const { name: activeTheme, source: activeThemeSource } = resolveActiveTheme();
  const packet = {
    type: "fmark.launch",
    project_path: input.projectRoot,
    session_id: input.sessionId ?? null,
    participant_id: input.participantId,
    runtime_id: input.runtimeId,
    mcp_status: input.mcpStatus,
    hooks_status: input.hooksStatus,
    // Fixed per-session context, pinned once so the agent needn't re-derive it.
    default_participant_id: input.participantId,
    default_session_id: input.sessionId ?? null,
    // The posting surface is not the design target: this is the renderer's
    // current *delivery* theme, not the design authority for repo-bound UI.
    // renderer_theme_source is "reported" only when a client has reported a
    // non-default theme; "default" means none reported yet — an unconfirmed
    // fallback (tokenize via var(--…), don't hardcode).
    renderer_current_theme: activeTheme,
    renderer_theme_source: activeThemeSource,
    design_target_policy:
      "The target repo/product's own styles are the design authority; " +
      "F-Mark's current renderer theme is the delivery surface only, not the palette. " +
      "target-repo-ui → read that repo's design source; fmark-ui → read packages/renderer/src; " +
      "session-artifact (unbound) → default to the Amber house theme.",
    session_artifact_theme_default: "amber",
    theme_tokens_ref: "fmark://theme",
    renderer_source_root: RENDERER_SOURCE_ROOT,
    known_lanes: ["conversation", "document"],
    pending_document: null,
  };
  const recentEvents = input.recentEvents ?? [];
  const existingSessionBrief =
    input.sessionId !== undefined && recentEvents.length > 0
      ? [
          "## Existing Session Brief",
          "You are joining an existing F-Mark session, not starting a new chat.",
          "Read the current context before making assumptions. Use `fmark_get_inbox` or `fmark_read_events` if the compact packet is not enough.",
          "If the latest user message is an active request, answer or continue that request instead of posting a generic connected greeting.",
          "",
          "```json",
          JSON.stringify(
            buildCompassPacket({
              sessionId: input.sessionId,
              sessionSlug: input.sessionSlug,
              participantId: input.participantId,
              cursorBefore: null,
              events: recentEvents,
            }),
            null,
            2,
          ),
          "```",
          "",
        ]
      : [];
  const renameBrief =
    input.sessionSlug !== undefined && isPlaceholderSessionSlug(input.sessionSlug)
      ? ["## Session Naming", sessionRenameNudge(), ""]
      : [];
  return markFmarkLaunchPrompt([
    ...existingSessionBrief,
    ...renameBrief,
    guide,
    "## Launch Packet",
    "Use this packet as the current bounded context for your first turn. Omit participant_id and session_id on tool calls to use the defaults listed here:",
    "",
    "```json",
    JSON.stringify(packet, null, 2),
    "```",
  ].join("\n"));
}

export async function readLaunchRecentEvents(
  p: Paths,
  sessionId: string | null | undefined,
): Promise<Awaited<ReturnType<typeof readEvents>>> {
  if (sessionId === null || sessionId === undefined) return [];
  return readEvents(p, sessionId, {}).catch(() => []);
}

export const LAUNCH_PACKET_FILENAME = "launch-packet.md";

/* The full launch packet (guide + session brief) grows without bound and has
   already exceeded tmux's ~16 KB command limit (spawn 500s, "command too
   long"). The launch argv therefore carries only this short marked pointer;
   the packet itself is written to the agent's state dir and the agent reads
   it back as its first action. The pointer keeps the launch marker so
   UserPromptSubmit hook filtering still drops it from user prose. */
export async function materializeLaunchPacket(input: {
  p: Paths;
  participantId: string;
  sessionId?: string;
  fullPrompt: string;
}): Promise<string> {
  const dir = join(input.p.fmarkDir(), "agents", input.participantId);
  await mkdir(dir, { recursive: true });
  const packetPath = join(dir, LAUNCH_PACKET_FILENAME);
  await writeFile(packetPath, input.fullPrompt, "utf8");
  const identity =
    input.sessionId !== undefined
      ? `You are F-Mark managed agent \`${input.participantId}\` in session \`${input.sessionId}\` (project \`${input.p.root()}\`).`
      : `You are F-Mark managed agent \`${input.participantId}\` (project \`${input.p.root()}\`).`;
  return markFmarkLaunchPrompt(
    [
      "# F-Mark launch",
      identity,
      "",
      `FIRST ACTION — before anything else: read the file \`${packetPath}\` with your file-read tool and follow it completely. It is your full onboarding: the F-Mark MCP contract, your identity and defaults, the active theme, and the session brief. Do not act on the session before reading it.`,
      "",
      "Fallback contract if that file is unreadable: communicate only through the `fmark` MCP tools — `fmark_post_prose` to speak, `fmark_end_turn` as the very last action of your turn — and say the launch packet could not be read.",
    ].join("\n"),
  );
}

function runtimeReady(snapshot: string, runtimeId: string): boolean {
  if (snapshot.trim().length === 0) return false;
  if (runtimeId === "claude") {
    return (
      snapshot.includes("Try ") ||
      snapshot.includes("for shortcuts") ||
      snapshot.includes("Claude Code")
    );
  }
  if (runtimeId === "codex") {
    return snapshot.includes("Codex") || snapshot.includes("Ask Codex");
  }
  return true;
}

export async function waitForRuntimeReady(input: {
  tmux: TmuxManager;
  sessionName: string;
  runtimeId: string;
  timeoutMs: number;
}): Promise<void> {
  const deadline = Date.now() + Math.max(input.timeoutMs, 0);
  for (;;) {
    try {
      if (
        runtimeReady(
          await input.tmux.captureSnapshot(input.sessionName),
          input.runtimeId,
        )
      ) {
        return;
      }
    } catch {
      return;
    }
    if (Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

export class ManagedAgentLaunchService {
  constructor(private readonly deps: ManagedAgentLaunchServiceDeps) {}

  async reconnect(input: {
    participantId: string;
    binding: ManagedAgentRootBinding;
  }): Promise<RouteResult<ControlBody>> {
    const current = await this.deps.buildStatusRow(
      input.participantId,
      input.binding,
    );
    if (current === null) {
      return {
        status: 404,
        body: { error: `agent not found: ${input.participantId}` },
      };
    }

    const state = input.binding.state;
    const currentRuntimeId =
      current.runtime_id ?? (await state.readRuntime(input.participantId));
    if (
      current.connection_state === "connected" &&
      currentRuntimeId !== "codex"
    ) {
      this.deps.tracker.setManagedPane(input.participantId, {
        paneAlive: () => true,
      });
      return { status: 200, body: { agent: current } };
    }
    if (currentRuntimeId === null) {
      return { status: 409, body: { error: "agent has no runtime_id" } };
    }

    const runtimeResult = await this.readRegisteredRuntime(currentRuntimeId);
    if (!runtimeResult.ok) return runtimeResult;

    const p = input.binding.paths;
    await this.deps.ensureLaunchProjectConnection(p);
    const userParticipantId = await this.deps.firstUserParticipantId(p);
    const setup = await this.ensureRuntimeSetup({
      runtimeId: currentRuntimeId,
      executable: runtimeResult.runtime.executable,
      participantId: input.participantId,
      userParticipantId,
      binding: input.binding,
    });
    const prompt = buildLaunchPrompt({
      sessionId: current.active_session ?? undefined,
      sessionSlug:
        current.active_session != null
          ? await readSessionSlug(p, current.active_session)
          : undefined,
      participantId: input.participantId,
      userParticipantId: userParticipantId ?? "us-yourname",
      runtimeId: currentRuntimeId,
      projectRoot: p.root(),
      mcpStatus: setup.mcpStatus,
      hooksStatus: setup.hooksStatus,
      recentEvents: await readLaunchRecentEvents(p, current.active_session),
    });
    const pointerPrompt = await materializeLaunchPacket({
      p,
      participantId: input.participantId,
      sessionId: current.active_session ?? undefined,
      fullPrompt: prompt,
    });
    const spawnArgs = spawnArgsForRuntime({
      runtimeId: currentRuntimeId,
      args: runtimeResult.runtime.args,
      desiredName: current.active_session,
      launchPrompt: pointerPrompt,
      override: await this.runtimeOverride(input.participantId, input.binding),
      accessMode: current.access.mode,
    });

    if (current.connection_state === "connected" && current.tmux_session !== null) {
      try {
        await this.deps.tmux.killSession(current.tmux_session);
      } catch {
        // Relaunch still attempts to create the managed pane.
      }
    }

    const sessionName = await this.spawnPane({
      participantId: input.participantId,
      userParticipantId,
      runtimeId: currentRuntimeId,
      executable: runtimeResult.runtime.executable,
      args: spawnArgs.args,
      env: runtimeResult.runtime.env,
      p,
      activeSession: current.active_session,
    });
    await state.writeTmuxSession(input.participantId, sessionName);
    await state.writeRuntime(input.participantId, currentRuntimeId);
    await state.mergeRuntimeSession(input.participantId, {
      desired_name: current.active_session,
      native_name_applied: spawnArgs.nativeNameApplied,
    });
    await this.markPaneLive({
      state,
      participantId: input.participantId,
      runtimeId: currentRuntimeId,
      sessionName,
      accessMode: undefined,
    });
    await state.appendLog(input.participantId, {
      event: "reconnect",
      tmux_session: sessionName,
      mcp_status: setup.mcpStatus,
      hooks_status: setup.hooksStatus,
    });
    this.schedulePaneWatchers({
      participantId: input.participantId,
      runtimeId: currentRuntimeId,
      sessionId: current.active_session,
      binding: input.binding,
      resetLiveText: true,
    });
    await this.deliverTmuxPrompt({
      runtimeId: currentRuntimeId,
      sessionName,
      prompt,
      readyDelayMs: runtimeResult.runtime.readyDelayMs ?? 0,
      delivery: spawnArgs.launchPromptDelivery,
    });
    await this.deps.publishAgentUpdated(input.participantId, input.binding);
    return this.controlResponse(input.participantId, input.binding);
  }

  async spawn(input: {
    body: Partial<SpawnRequest>;
    binding: ManagedAgentRootBinding;
  }): Promise<RouteResult<SpawnBody>> {
    const runtimeId = input.body.runtime_id;
    if (typeof runtimeId !== "string" || runtimeId.length === 0) {
      return { status: 400, body: { error: "runtime_id required" } };
    }

    const p = input.binding.paths;
    await this.deps.ensureLaunchProjectConnection(p);
    const runtimes = await this.loadRegistryForLaunch();
    if (!runtimes.ok) return runtimes;
    const runtime = runtimes.registry.runtimes[runtimeId];
    if (runtime === undefined) {
      return {
        status: 400,
        body: { error: `unknown runtime_id: ${runtimeId}` },
      };
    }

    const access = resolveRequestedAccessMode(runtimeId, input.body.access_mode);
    if (!access.ok) return { status: 400, body: { error: access.error } };

    const participantId = this.spawnParticipantId(input.body, runtimeId);
    if (!isValidParticipantId(participantId)) {
      return { status: 400, body: { error: "invalid participant_id" } };
    }
    const sessionCheck = await this.validateRequestedSession(p, input.body.session_id);
    if (!sessionCheck.ok) return sessionCheck;

    const state = input.binding.state;
    const userParticipantId = await this.deps.firstUserParticipantId(p);
    const setup = await this.ensureRuntimeSetup({
      runtimeId,
      executable: runtime.executable,
      participantId,
      userParticipantId,
      binding: input.binding,
    });
    const registered = await this.registerSpawnParticipant({
      p,
      participantId,
      runtimeId,
      displayName: input.body.name ?? randomizedDisplayName(runtime.displayName),
      knownRuntimeIds: new Set(Object.keys(runtimes.registry.runtimes)),
    });
    if (!registered.ok) return registered;

    const selection = await this.persistLaunchSelection({
      p,
      participantId,
      runtimeId,
      model: input.body.model,
      effort: input.body.effort,
      accessMode:
        input.body.access_mode !== undefined ? access.accessMode : undefined,
    });
    if (!selection.ok) return selection;

    const desiredName = input.body.session_id ?? null;
    const runtimeSession: RuntimeSessionInfo = {
      desired_name: desiredName,
      native_name_applied: false,
    };
    const launchPrompt = buildLaunchPrompt({
      sessionId: input.body.session_id,
      sessionSlug:
        input.body.session_id !== undefined
          ? await readSessionSlug(p, input.body.session_id)
          : undefined,
      participantId,
      userParticipantId: userParticipantId ?? "us-yourname",
      runtimeId,
      projectRoot: p.root(),
      mcpStatus: setup.mcpStatus,
      hooksStatus: setup.hooksStatus,
      recentEvents: await readLaunchRecentEvents(p, input.body.session_id),
    });
    const pointerPrompt = await materializeLaunchPacket({
      p,
      participantId,
      sessionId: input.body.session_id,
      fullPrompt: launchPrompt,
    });
    const spawnArgs = spawnArgsForRuntime({
      runtimeId,
      args: runtime.args,
      desiredName,
      launchPrompt: pointerPrompt,
      override: await this.runtimeOverride(participantId, input.binding),
      accessMode: access.accessMode,
    });
    runtimeSession.native_name_applied = spawnArgs.nativeNameApplied;

    const sessionName = await this.spawnPane({
      participantId,
      userParticipantId,
      runtimeId,
      executable: runtime.executable,
      args: spawnArgs.args,
      env: runtime.env,
      p,
      activeSession: input.body.session_id ?? null,
    });
    await this.persistSpawnedPane({
      state,
      participantId,
      runtimeId,
      runtimeSession,
      sessionName,
      accessMode: access.accessMode,
      activeSession: input.body.session_id,
    });
    const hooksStatus = await this.seedHookPresence({
      participantId,
      runtimeId,
      userParticipantId,
      projectRoot: p.root(),
      currentStatus: setup.hooksStatus,
    });
    await this.deliverTmuxPrompt({
      runtimeId,
      sessionName,
      prompt: launchPrompt,
      readyDelayMs: runtime.readyDelayMs ?? 0,
      delivery: spawnArgs.launchPromptDelivery,
    });

    const activeSession = input.body.session_id ?? null;
    this.deps.bus.publish({
      type: "managed-agent.spawned",
      participant_id: participantId,
      tmux_session: sessionName,
      runtime_id: runtimeId,
      active_session: activeSession,
      ...(input.binding.pathId !== undefined ? { pathId: input.binding.pathId } : {}),
      ...(input.binding.revision !== undefined
        ? { revision: input.binding.revision }
        : {}),
    });
    this.schedulePaneWatchers({
      participantId,
      runtimeId,
      sessionId: activeSession,
      binding: input.binding,
      resetLiveText: true,
    });
    return {
      status: 200,
      body: {
        participant_id: participantId,
        tmux_session: sessionName,
        runtime_id: runtimeId,
        active_session: activeSession,
        path_id: input.binding.pathId,
        root: p.root(),
        mcp_status: setup.mcpStatus,
        hooks_status: hooksStatus,
        runtime_session: runtimeSession,
      },
    };
  }

  private async readRegisteredRuntime(
    runtimeId: string,
  ): Promise<
    | { ok: true; runtime: Awaited<ReturnType<typeof loadRuntimeRegistry>>["runtimes"][string] }
    | RouteResult<ErrorBody>
  > {
    const runtimes = await loadRuntimeRegistry({
      fallback: this.deps.fallbackPaths,
      ref: this.deps.pathContextRef,
    });
    const runtime = runtimes.runtimes[runtimeId];
    if (runtime === undefined) {
      return {
        status: 400,
        body: { error: `unknown runtime_id: ${runtimeId}` },
      };
    }
    return { ok: true, runtime };
  }

  private async loadRegistryForLaunch(): Promise<
    | { ok: true; registry: Awaited<ReturnType<typeof loadRuntimeRegistry>> }
    | RouteResult<ErrorBody>
  > {
    try {
      const registry = await loadRuntimeRegistry({
        fallback: this.deps.fallbackPaths,
        ref: this.deps.pathContextRef,
      });
      return { ok: true, registry };
    } catch {
      return { status: 500, body: { error: "failed to load runtimes" } };
    }
  }

  private async ensureRuntimeSetup(
    input: RuntimeSetupInput,
  ): Promise<{ mcpStatus: SpawnSetupStatus; hooksStatus: SpawnSetupStatus }> {
    let mcpStatus: SpawnSetupStatus = "unknown";
    let hooksStatus: SpawnSetupStatus = "unknown";
    const chosen = await resolveChosenScope(
      input.runtimeId,
      globalPaths(resolveConfigRoot(this.deps.integrationEnv)),
    );

    try {
      const setup = await preflightRegisteredIntegration({
        runtimeId: input.runtimeId,
        participantId: input.participantId,
        userParticipantId: input.userParticipantId,
        projectRoot: input.binding.paths.root(),
        chosenScope: chosen.integrationScope,
        registryDeps: {
          fallback: this.deps.fallbackPaths,
          ref: this.deps.pathContextRef,
        },
        env: this.deps.integrationEnv,
      });
      mcpStatus = setup.mcp.status;
      hooksStatus = setup.hooks.status;
    } catch {
      // Spawn/reconnect remain compatibility fallbacks.
    }

    hooksStatus = await this.detectHookStatus({
      runtimeId: input.runtimeId,
      participantId: input.participantId,
      userParticipantId: input.userParticipantId,
      projectRoot: input.binding.paths.root(),
      chosenScope: chosen.integrationScope,
      currentStatus: hooksStatus,
    });

    if (mcpStatus === "installed" && hooksStatus !== "missing") {
      return { mcpStatus, hooksStatus };
    }

    try {
      const applied = await this.deps.applyIntegrationWithManagedCleanup({
        runtimeId: input.runtimeId,
        executable: input.executable,
        projectRoot: input.binding.paths.root(),
        scope: chosen.integrationScope,
        participantId: input.participantId,
        userParticipantId: input.userParticipantId,
        env: this.deps.integrationEnv,
        p: input.binding.paths,
        state: input.binding.state,
      });
      return {
        mcpStatus: applied.mcp.status,
        hooksStatus: applied.hooks.status,
      };
    } catch {
      return { mcpStatus, hooksStatus };
    }
  }

  private async detectHookStatus(input: {
    runtimeId: string;
    participantId: string;
    userParticipantId?: string;
    projectRoot: string;
    chosenScope: IntegrationScope;
    currentStatus: SpawnSetupStatus;
  }): Promise<SpawnSetupStatus> {
    try {
      const detect = await this.deps.hookStatusCheck({
        runtimeId: input.runtimeId,
        participantId: input.participantId,
        userParticipantId: input.userParticipantId,
        projectRoot: input.projectRoot,
        env: this.deps.integrationEnv,
      });
      const chosenHookScope = hookInstallScopeFor(
        input.runtimeId,
        input.chosenScope,
      );
      const chosenLocation = detect.locations?.find(
        (location) => location.scope === chosenHookScope,
      );
      if (chosenLocation !== undefined) {
        if (chosenLocation.installed) return "installed";
        if (chosenLocation.expectedEntries.length > 0) return "missing";
        return "not_required";
      }
      if (detect.locations !== undefined) return "missing";
      if (detect.installed) return "installed";
      if (detect.expectedEntries.length > 0) return "missing";
      return "not_required";
    } catch {
      return input.currentStatus;
    }
  }

  private async runtimeOverride(
    participantId: string,
    binding: ManagedAgentRootBinding,
  ): Promise<RuntimeOverridePatch | undefined> {
    const participants = await listParticipants(binding.paths, {
      agentState: binding.state,
    });
    const persisted = participants[participantId];
    if (!persisted?.model_override && !persisted?.effort_override) return undefined;
    return {
      model: persisted.model_override,
      effort: persisted.effort_override,
    };
  }

  private async persistLaunchSelection(input: {
    p: Paths;
    participantId: string;
    runtimeId: string;
    model?: string;
    effort?: string;
    accessMode?: string;
  }): Promise<{ ok: true } | RouteResult<ErrorBody>> {
    let patch: RuntimeOverridePatch | undefined;
    if (input.model !== undefined || input.effort !== undefined) {
      try {
        patch = await validateRuntimeModelPatch({
          runtimeId: input.runtimeId,
          model: input.model,
          effort: input.effort,
        });
      } catch (e) {
        if (e instanceof RuntimeModelValidationError) {
          return { status: e.status, body: { error: e.message } };
        }
        throw e;
      }
      await setParticipantOverrides(input.p, input.participantId, {
        model: patch.model,
        effort: patch.effort,
      });
    }

    await writeLaunchDefaults(
      input.runtimeId,
      {
        ...(typeof patch?.model === "string" ? { model: patch.model } : {}),
        ...(typeof patch?.effort === "string" ? { effort: patch.effort } : {}),
        ...(input.accessMode !== undefined
          ? { access_mode: input.accessMode }
          : {}),
      },
      globalPaths(resolveConfigRoot(this.deps.integrationEnv)),
    ).catch(() => {
      /* Remembered defaults are convenience only; launch should still proceed. */
    });
    return { ok: true };
  }

  private spawnParticipantId(
    body: Partial<SpawnRequest>,
    runtimeId: string,
  ): string {
    return (
      body.suggested_participant_id ??
      `ag-${runtimeId.slice(0, 8)}-${randomBytes(2).toString("hex")}`
    );
  }

  private async validateRequestedSession(
    p: Paths,
    sessionId: string | undefined,
  ): Promise<{ ok: true } | RouteResult<ErrorBody>> {
    if (sessionId === undefined) return { ok: true };
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return {
        status: 400,
        body: { error: "session_id must be a non-empty string" },
      };
    }
    if (!(await sessionExists(p, sessionId))) {
      return {
        status: 404,
        body: { error: `session not found: ${sessionId}` },
      };
    }
    return { ok: true };
  }

  private async registerSpawnParticipant(input: {
    p: Paths;
    participantId: string;
    runtimeId: string;
    displayName: string;
    knownRuntimeIds: Set<string>;
  }): Promise<{ ok: true } | RouteResult<ErrorBody>> {
    try {
      await registerAgent(input.p, {
        name: input.displayName,
        suggested_id: input.participantId,
        runtime_id: input.runtimeId,
        knownRuntimeIds: input.knownRuntimeIds,
      });
      return { ok: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("already registered")) {
        return { status: 400, body: { error: msg } };
      }
      await setParticipantRuntime(
        input.p,
        input.participantId,
        input.runtimeId,
        input.knownRuntimeIds,
      );
      return { ok: true };
    }
  }

  private async spawnPane(input: {
    participantId: string;
    userParticipantId?: string;
    runtimeId: string;
    executable: string;
    args: string[];
    env?: Record<string, string>;
    p: Paths;
    activeSession: string | null;
  }): Promise<string> {
    await this.deps.ensureLaunchProjectConnection(input.p);
    const { sessionName } = await this.deps.tmux.spawnAgent({
      participantId: input.participantId,
      executable: input.executable,
      args: input.args,
      projectRoot: input.p.root(),
      env: {
        ...(input.env ?? {}),
        F_MARK_RUNTIME_ID: input.runtimeId,
        F_MARK_PATH: input.p.root(),
        ...(input.userParticipantId !== undefined
          ? { F_MARK_USER_ID: input.userParticipantId }
          : {}),
        ...(input.activeSession !== null
          ? { F_MARK_SESSION_ID: input.activeSession }
          : {}),
      },
    });
    return sessionName;
  }

  private async persistSpawnedPane(input: {
    state: AgentStateStore;
    participantId: string;
    runtimeId: string;
    runtimeSession: RuntimeSessionInfo;
    sessionName: string;
    accessMode: string;
    activeSession?: string;
  }): Promise<void> {
    try {
      await input.state.writeTmuxSession(input.participantId, input.sessionName);
      await input.state.writeRuntime(input.participantId, input.runtimeId);
      await input.state.writeRuntimeSession(
        input.participantId,
        input.runtimeSession,
      );
      await this.markPaneLive({
        state: input.state,
        participantId: input.participantId,
        runtimeId: input.runtimeId,
        sessionName: input.sessionName,
        accessMode: input.accessMode,
      });
      if (input.activeSession !== undefined) {
        await input.state.writeActiveSession(input.participantId, input.activeSession);
      }
      await input.state.appendLog(input.participantId, {
        event: "spawn",
        runtime: input.runtimeId,
        access_mode: input.accessMode,
        tmux_session: input.sessionName,
        runtime_session: input.runtimeSession,
      });
    } catch (err) {
      try {
        await this.deps.tmux.killSession(input.sessionName);
      } catch {
        // Best-effort cleanup; surface the original write failure.
      }
      throw err;
    }
  }

  private async markPaneLive(input: {
    state: AgentStateStore;
    participantId: string;
    runtimeId: string;
    sessionName: string;
    accessMode: string | undefined;
  }): Promise<void> {
    await input.state.updateControlState(input.participantId, {
      ...(input.accessMode !== undefined ? { access_mode: input.accessMode } : {}),
      activity_state: "notified",
      last_activity_at: new Date().toISOString(),
      idle_stopped_at: null,
      idle_stop_reason: null,
      last_tmux_session: input.sessionName,
      pane_lifecycle: "live",
    });
    this.deps.tracker.setManagedPane(input.participantId, {
      paneAlive: () => true,
    });
  }

  private async seedHookPresence(input: {
    participantId: string;
    runtimeId: string;
    userParticipantId?: string;
    projectRoot: string;
    currentStatus: SpawnSetupStatus;
  }): Promise<SpawnSetupStatus> {
    try {
      const detect = await this.deps.hookStatusCheck({
        runtimeId: input.runtimeId,
        participantId: input.participantId,
        userParticipantId: input.userParticipantId,
        projectRoot: input.projectRoot,
        env: this.deps.integrationEnv,
      });
      const chosen = await resolveChosenScope(
        input.runtimeId,
        globalPaths(resolveConfigRoot(this.deps.integrationEnv)),
      );
      const chosenHookScope = hookInstallScopeFor(
        input.runtimeId,
        chosen.integrationScope,
      );
      const chosenLocation = detect.locations?.find(
        (location) => location.scope === chosenHookScope,
      );
      const hooksRequired =
        chosenLocation !== undefined
          ? chosenLocation.expectedEntries.length > 0
          : detect.locations !== undefined
            ? true
            : detect.expectedEntries.length > 0;
      const installed =
        chosenLocation !== undefined
          ? chosenLocation.installed
          : detect.locations !== undefined
            ? false
            : detect.installed;
      if (installed) {
        this.deps.tracker.setManagedHookStatus(input.participantId, true);
        return "installed";
      }
      if (hooksRequired) {
        this.deps.tracker.setManagedHookStatus(input.participantId, false);
        return "missing";
      }
      this.deps.tracker.markReconciledStale(input.participantId, {
        paneAlive: () => true,
      });
      return "not_required";
    } catch {
      return input.currentStatus;
    }
  }

  private async deliverTmuxPrompt(input: {
    runtimeId: string;
    sessionName: string;
    prompt: string;
    readyDelayMs: number;
    delivery: "native" | "tmux";
  }): Promise<void> {
    if (input.delivery !== "tmux") return;
    const fire = async (): Promise<void> => {
      await waitForRuntimeReady({
        tmux: this.deps.tmux,
        sessionName: input.sessionName,
        runtimeId: input.runtimeId,
        timeoutMs: input.readyDelayMs,
      });
      await this.deps.inputQueue.enqueue(input.sessionName, () =>
        this.deps.tmux.deliverPrompt(input.sessionName, input.prompt),
      );
    };

    if (input.readyDelayMs > 0) {
      setTimeout(() => {
        void fire().catch(() => {
          /* best-effort */
        });
      }, input.readyDelayMs).unref?.();
      return;
    }
    await fire();
  }

  private schedulePaneWatchers(input: {
    participantId: string;
    runtimeId: string;
    sessionId: string | null | undefined;
    binding: ManagedAgentRootBinding;
    resetLiveText: boolean;
  }): void {
    this.deps.scheduleTerminalAccessPolling({
      participantId: input.participantId,
      runtimeId: input.runtimeId,
      binding: input.binding,
    });
    this.deps.scheduleCodexLiveTextPolling({
      participantId: input.participantId,
      sessionId: input.sessionId,
      runtimeId: input.runtimeId,
      binding: input.binding,
      reset: input.resetLiveText,
    });
  }

  private async controlResponse(
    participantId: string,
    binding: ManagedAgentRootBinding,
  ): Promise<RouteResult<ControlBody>> {
    const agent = await this.deps.buildStatusRow(participantId, binding);
    if (agent === null) {
      return { status: 404, body: { error: `agent not found: ${participantId}` } };
    }
    return { status: 200, body: { agent } };
  }
}
