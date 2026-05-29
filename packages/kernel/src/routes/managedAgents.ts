import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type {
  AccessRequestPayload,
  AccessResponsePayload,
  AgentAccessStatus,
  AgentConnectionState,
  AgentContextStatus,
  AgentStatusRow,
  GetInboxResponse,
  IntegrationStatus,
  IntegrationApplyRequest,
  IntegrationPreflightRequest,
  ManagedAccessResponseRequest,
  ManagedAccessResponseResponse,
  ManagedAgentAccessPatch,
  MarkSeenRequest,
  MarkSeenResponse,
  ManagedAgentCommandRequest,
  ManagedAgentControlResponse,
  ManagedAgentRenameRequest,
  ManagedAgentsStatusResponse,
  RuntimeOverridePatch,
  RuntimeSessionInfo,
  SpawnRequest,
  SpawnTerminalRequest,
  WakeSessionRequest,
  WakeSessionResponse,
} from "@f-mark/shared";
import { getAdapter } from "../runtimes/adapters/index.js";
import { paths as makePaths, type Paths } from "../paths.js";
import type { TmuxManager } from "../tmux/manager.js";
import type { PresenceTracker } from "../presence/tracker.js";
import {
  registerAgent,
  isValidParticipantId,
  listParticipants,
  setParticipantRuntime,
  updateParticipant,
} from "../participants.js";
import { loadRuntimeRegistry } from "../runtimes/store.js";
import type { InputQueue } from "../tmux/inputQueue.js";
import { validateSlashCommand, validateMessageText } from "../runtimes/validation.js";
import { checkHookInstallStatus as defaultCheckHookInstallStatus } from "../hooksInstall/index.js";
import { applyIntegration, preflightIntegration } from "../mcpInstall/index.js";
import { buildMcpGuide } from "./guide.js";
import type { Bus } from "../ws/bus.js";
import type { PathContextRef } from "../paths/contextRef.js";
import { createAgentStateStore } from "../services/agentState.js";
import { listSessions, sessionExists } from "../sessions.js";
import { readEvents } from "../events/reader.js";
import { readInbox, markInboxSeen } from "../compass/inbox.js";
import { buildCompassPacket, buildWakePrompt } from "../compass/packet.js";
import {
  RUNTIME_CONTROL_CAPABILITIES,
  runtimeCapabilities,
  runtimeControlCommand,
  type RuntimeControlAction,
} from "../agents/capabilities.js";
import { writeAccessResponseEvent } from "../services/events.js";
import { publishEventWrites } from "../services/eventPublisher.js";
import { ensureProjectAuth } from "../auth.js";
import { markFmarkLaunchPrompt } from "../launchPrompt.js";

export interface ManagedAgentsDeps {
  paths: Paths;
  tmux: TmuxManager;
  tracker: PresenceTracker;
  projectRoot: string;
  /**
   * Shared per-pane input queue. Lifted to server scope (createServer)
   * so both `registerManagedAgentsRoutes` and `registerPaneWebSocket`
   * enqueue tmux sends against the same queue object, preventing byte-
   * level interleaving between kernel-injected slash commands and
   * overlay-typed WS input.
   */
  inputQueue: InputQueue;
  /**
   * Broadcast bus for managed-agent WS messages. Used to publish
   * `managed-agent.spawned`, `managed-agent.killed`, and
   * `managed-agent.terminal-spawned` after successful route operations,
   * so the renderer can update chip state without a manual list refresh.
   */
  bus: Bus;
  /**
   * Optional override for the hook-install detection used by the spawn
   * route. Defaults to the production `checkHookInstallStatus`; tests inject
   * a fake to drive the kickoff send-keys path without touching real config
   * files.
   */
  checkHookInstallStatus?: typeof defaultCheckHookInstallStatus;
  /**
   * Optional multi-path ref. When wired with an active path, agent state
   * lives under ~/.config/f-mark/projects/<pathId>/agents/ instead of the
   * per-path <root>/.f-mark/agents/. Tests omit this and keep the legacy
   * per-path layout.
   */
  pathContextRef?: PathContextRef;
  authToken?: string | null;
}

const CONFIRM_TTL_MS = 10_000;

interface ConfirmEntry {
  token: string;
  exp: number;
}

type SpawnSetupStatus = IntegrationStatus | "unknown";

function randomizedDisplayName(displayName: string): string {
  return `${displayName} ${randomBytes(2).toString("hex")}`;
}

function supportsNativeSessionName(runtimeId: string): boolean {
  return runtimeId === "claude";
}

function hasClaudeNameArg(args: string[]): boolean {
  return args.includes("--name") || args.includes("-n");
}

export function applyRuntimeOverride(
  runtimeId: string,
  args: string[],
  override: RuntimeOverridePatch | undefined,
): string[] {
  if (!override || (!override.model && !override.effort)) return args;
  const adapter = getAdapter(runtimeId);
  if (!adapter) return args;
  const sanitized = adapter.sanitizeArgs(args, override);
  return [...sanitized, ...adapter.buildSpawnArgs(override)];
}

function spawnArgsForRuntime(input: {
  runtimeId: string;
  args: string[];
  desiredName: string | null;
  launchPrompt: string;
  override?: RuntimeOverridePatch;
}): {
  args: string[];
  nativeNameApplied: boolean;
  launchPromptDelivery: "native" | "tmux";
} {
  let args = applyRuntimeOverride(input.runtimeId, input.args, input.override);
  let nativeNameApplied = false;
  if (
    input.desiredName !== null &&
    supportsNativeSessionName(input.runtimeId) &&
    !hasClaudeNameArg(input.args)
  ) {
    args = ["--name", input.desiredName, ...args];
    nativeNameApplied = true;
  }

  if (input.runtimeId === "claude" || input.runtimeId === "codex") {
    return {
      args: [...args, input.launchPrompt],
      nativeNameApplied,
      launchPromptDelivery: "native",
    };
  }

  if (input.runtimeId === "gemini") {
    const hasPromptArg = args.some(
      (arg) =>
        arg === "--prompt-interactive" ||
        arg === "-i" ||
        arg === "--prompt" ||
        arg === "-p",
    );
    if (!hasPromptArg) {
      const trustArgs = args.includes("--skip-trust")
        ? args
        : ["--skip-trust", ...args];
      return {
        args: [...trustArgs, "--prompt-interactive", input.launchPrompt],
        nativeNameApplied,
        launchPromptDelivery: "native",
      };
    }
  }

  if (input.runtimeId === "opencode") {
    const hasPromptArg = args.some((arg) => arg === "--prompt");
    if (!hasPromptArg) {
      return {
        args: [...args, "--prompt", input.launchPrompt],
        nativeNameApplied,
        launchPromptDelivery: "native",
      };
    }
  }

  return { args, nativeNameApplied, launchPromptDelivery: "tmux" };
}

function buildLaunchPrompt(input: {
  sessionId?: string;
  participantId: string;
  userParticipantId: string;
  runtimeId: string;
  projectRoot: string;
  mcpStatus: SpawnSetupStatus;
  hooksStatus: SpawnSetupStatus;
}): string {
  const guide = buildMcpGuide({
    sessionId: input.sessionId,
    agentId: input.participantId,
    runtimeId: input.runtimeId,
    userParticipantId: input.userParticipantId,
  }).trim();
  const packet = {
    type: "fmark.launch",
    project_path: input.projectRoot,
    session_id: input.sessionId ?? null,
    participant_id: input.participantId,
    runtime_id: input.runtimeId,
    mcp_status: input.mcpStatus,
    hooks_status: input.hooksStatus,
  };
  return markFmarkLaunchPrompt([
    guide,
    "## Launch Packet",
    "Use this packet as the current bounded context for your first turn:",
    "",
    "```json",
    JSON.stringify(packet, null, 2),
    "```",
  ].join("\n"));
}

function publicInboxResponse(snapshot: Awaited<ReturnType<typeof readInbox>>): GetInboxResponse {
  return {
    session_id: snapshot.session_id,
    participant_id: snapshot.participant_id,
    cursor_before: snapshot.cursor_before,
    cursor_after: snapshot.cursor_after,
    events: snapshot.events,
  };
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
  if (runtimeId === "gemini") {
    return snapshot.includes("Gemini") || snapshot.includes("shell mode");
  }
  return true;
}

async function waitForRuntimeReady(input: {
  tmux: TmuxManager;
  sessionName: string;
  runtimeId: string;
  timeoutMs: number;
}): Promise<void> {
  const deadline = Date.now() + Math.max(input.timeoutMs, 0);
  for (;;) {
    try {
      if (runtimeReady(await input.tmux.captureSnapshot(input.sessionName), input.runtimeId)) {
        return;
      }
    } catch {
      return;
    }
    if (Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

function connectionState(input: {
  managed: boolean;
  tmuxSession: string | null;
  liveSessionNames: ReadonlySet<string>;
}): AgentConnectionState {
  if (input.managed && input.tmuxSession !== null) {
    return input.liveSessionNames.has(input.tmuxSession)
      ? "connected"
      : "detached";
  }
  return "offline";
}

function unknownContext(): AgentContextStatus {
  return {
    status: "unknown",
    used_tokens: null,
    max_tokens: null,
    source: "unknown",
  };
}

function accessStatus(input: {
  runtimeId: string | null;
  mode: string;
}): AgentAccessStatus {
  const caps = runtimeCapabilities(input.runtimeId);
  return {
    mode: input.mode,
    supported_modes: caps.access_modes,
    change_supported: caps.access_change_supported,
    ...(caps.access_change_supported
      ? {}
      : { reason: "live access changes are not verified for this runtime" }),
  };
}

function controlAllowed(activity: string): boolean {
  return (
    activity !== "running" &&
    activity !== "notified" &&
    activity !== "access-pending"
  );
}

function responseStatus(
  decision: ManagedAccessResponseRequest["decision"],
): AccessResponsePayload["status"] {
  return decision === "approve" ? "approved" : "denied";
}

function statusFromExpired(): AccessResponsePayload["status"] {
  return "expired";
}

function isOpenAccessRequest(event: unknown): event is {
  filename: string;
  timestamp: string;
  participant_id: string;
  kind: "access-request";
  payload: AccessRequestPayload;
} {
  if (event === null || typeof event !== "object") return false;
  const e = event as { kind?: unknown; payload?: unknown };
  const payload = e.payload as Partial<AccessRequestPayload> | undefined;
  return (
    e.kind === "access-request" &&
    payload !== undefined &&
    payload.schema === "fmark.access-request.v1" &&
    typeof payload.request_id === "string" &&
    payload.status === "open"
  );
}

function isAccessResponse(event: unknown): event is {
  kind: "access-response";
  payload: AccessResponsePayload;
} {
  if (event === null || typeof event !== "object") return false;
  const e = event as { kind?: unknown; payload?: unknown };
  const payload = e.payload as Partial<AccessResponsePayload> | undefined;
  return (
    e.kind === "access-response" &&
    payload !== undefined &&
    payload.schema === "fmark.access-response.v1" &&
    typeof payload.request_id === "string"
  );
}

async function pendingAccessCounts(input: {
  p: Paths;
  sessionFilter?: string;
}): Promise<Map<string, number>> {
  const sessions =
    input.sessionFilter !== undefined
      ? [{ id: input.sessionFilter }]
      : await listSessions(input.p);
  const counts = new Map<string, number>();
  for (const session of sessions) {
    let events;
    try {
      events = await readEvents(input.p, session.id, {
        kinds: ["access-request", "access-response"],
      });
    } catch {
      continue;
    }
    const responded = new Set<string>();
    for (const event of events) {
      if (isAccessResponse(event)) responded.add(event.payload.request_id);
    }
    for (const event of events) {
      if (!isOpenAccessRequest(event)) continue;
      if (responded.has(event.payload.request_id)) continue;
      counts.set(event.participant_id, (counts.get(event.participant_id) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Cookie-auth Origin/Host gate for mutating /managed-agents/* routes.
 *
 * Defence-in-depth per the v0.4 Security spec: any cookie-authenticated
 * mutating request must carry an `Origin` header whose host resolves to
 * `localhost`, `127.0.0.1`, or matches the request's own `Host` header.
 *
 * Bearer-authenticated requests (`Authorization: Bearer …`) bypass the check,
 * because the bearer token is not silently sent by browsers across origins.
 * GETs are unaffected.
 */
function makeManagedAgentsOriginHook(): (
  req: import("fastify").FastifyRequest,
  reply: import("fastify").FastifyReply,
) => Promise<void> {
  return async (req, reply) => {
    // Only scope this hook to /managed-agents/* URLs. We register globally
    // (Fastify hooks bubble), so we have to gate by prefix ourselves.
    if (!req.url.startsWith("/managed-agents")) return;
    if (req.method === "GET") return; // read-only routes never gated
    const hasHeader = req.headers.authorization !== undefined;
    if (hasHeader) return; // bearer auth — skip
    const cookieHeader = req.headers.cookie ?? "";
    const hasCookie = cookieHeader.includes("fmark_token=");
    if (!hasCookie) return; // no auth at all → upstream auth gate will 401
    const origin = req.headers.origin;
    if (typeof origin !== "string" || origin.length === 0) {
      reply
        .code(403)
        .send({ error: "cookie-authenticated request missing Origin header" });
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      reply.code(403).send({ error: `invalid Origin header: ${origin}` });
      return;
    }
    const host = parsed.hostname;
    const rawHost = (req.headers.host ?? "").toString();
    // host header is "name[:port]" — strip port for comparison.
    const reqHost = rawHost.split(":")[0] ?? "";
    if (host !== "localhost" && host !== "127.0.0.1" && host !== reqHost) {
      reply.code(403).send({ error: `Origin ${origin} not allowed` });
      return;
    }
  };
}

export function registerManagedAgentsRoutes(
  app: FastifyInstance,
  deps: ManagedAgentsDeps,
): void {
  const { paths, tmux, tracker, inputQueue, bus } = deps;
  const hookStatusCheck = deps.checkHookInstallStatus ?? defaultCheckHookInstallStatus;
  // Per-request path/state resolution. When a multi-path ref is wired with
  // an active path, state lives under ~/.config/f-mark/projects/<pathId>/agents
  // and reads bridge back to the active path's legacy .f-mark/agents dir.
  const routePaths = (): Paths => {
    const active = deps.pathContextRef?.get().active ?? null;
    return active !== null ? makePaths(active.root()) : paths;
  };
  const agentState = () =>
    createAgentStateStore({ ref: deps.pathContextRef, fallback: paths });

  async function firstUserParticipantId(p: Paths): Promise<string | undefined> {
    try {
      const participants = await listParticipants(p, { agentState: agentState() });
      for (const [id, participant] of Object.entries(participants)) {
        if (participant.kind === "user") return id;
      }
    } catch {
      // Preflight/apply can still proceed for runtimes that do not need a
      // user hook id; Codex will return a clear apply error if one is needed.
    }
    return undefined;
  }

  // Defence-in-depth: gate cookie-authenticated mutating requests by Origin.
  // Registered before the routes so it runs on every /managed-agents/* call.
  app.addHook("preHandler", makeManagedAgentsOriginHook());

  // Per-registration confirm-token map so multiple Fastify instances in the
  // same process (e.g. parallel test apps) cannot share or stomp on each
  // other's tokens.
  const confirmTokens = new Map<string, ConfirmEntry>();

  // `inputQueue` is the per-pane queue *shared* with /ws/pane (created in
  // createServer). All tmux sends from this module enqueue against the
  // agent's tmux-session as the pane key, so kernel-injected commands and
  // overlay-typed WS input cannot interleave at the tmux byte level.

  app.post<{ Body: IntegrationPreflightRequest }>(
    "/managed-agents/preflight",
    {
      schema: {
        body: {
          type: "object",
          required: ["runtime_id"],
          additionalProperties: false,
          properties: {
            runtime_id: { type: "string", minLength: 1 },
            participant_id: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const p = routePaths();
      return preflightIntegration({
        runtimeId: req.body.runtime_id,
        participantId: req.body.participant_id,
        userParticipantId: await firstUserParticipantId(p),
        projectRoot: p.root(),
        env: process.env,
      });
    },
  );

  app.post<{ Body: IntegrationApplyRequest }>(
    "/managed-agents/integration-apply",
    {
      schema: {
        body: {
          type: "object",
          required: ["runtime_id"],
          additionalProperties: false,
          properties: {
            runtime_id: { type: "string", minLength: 1 },
            participant_id: { type: "string" },
            scope: {
              type: "string",
              enum: ["project", "user", "local"],
            },
          },
        },
      },
    },
    async (req, reply) => {
      const p = routePaths();
      await ensureProjectAuth(p, deps.authToken ?? null);
      try {
        return await applyIntegration({
          runtimeId: req.body.runtime_id,
          participantId: req.body.participant_id,
          userParticipantId: await firstUserParticipantId(p),
          scope: req.body.scope,
          projectRoot: p.root(),
          env: process.env,
        });
      } catch (err) {
        reply.code(409);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  function mintConfirm(id: string): string {
    const token = randomBytes(8).toString("hex");
    confirmTokens.set(id, { token, exp: Date.now() + CONFIRM_TTL_MS });
    return token;
  }

  function consumeConfirm(id: string, token: string): boolean {
    const entry = confirmTokens.get(id);
    if (!entry) return false;
    if (Date.now() > entry.exp) {
      confirmTokens.delete(id);
      return false;
    }
    if (entry.token !== token) return false;
    confirmTokens.delete(id);
    return true;
  }

  async function buildStatusRows(
    sessionFilter?: string,
  ): Promise<ManagedAgentsStatusResponse> {
    const p = routePaths();
    const state = agentState();
    const participants = await listParticipants(p, { agentState: state });
    const pendingCounts = await pendingAccessCounts({ p, sessionFilter });
    const managedIds = new Set(await state.listManagedAgentIds());
    const liveSessionNames = new Set(
      (await tmux.listFmarkSessions()).map((session) => session.sessionName),
    );
    const agents: AgentStatusRow[] = [];

    for (const [participantId, participant] of Object.entries(participants)) {
      if (participant.kind !== "agent") continue;
      const activeSession = participant.active_session;
      if (sessionFilter !== undefined && activeSession !== sessionFilter) continue;
      const runtimeId =
        participant.runtime_id ?? (await state.readRuntime(participantId));
      const tmuxSession = await state.readTmuxSession(participantId);
      const runtimeSession = await state.readRuntimeSession(participantId);
      const control = await state.readControlState(participantId);
      const pendingAccessCount = pendingCounts.get(participantId) ?? 0;
      const activityState =
        pendingAccessCount > 0 ? "access-pending" : control.activity_state;
      const managed = managedIds.has(participantId);
      agents.push({
        participant_id: participantId,
        display_name: participant.name,
        runtime_id: runtimeId,
        active_session: activeSession,
        runtime_session: runtimeSession,
        managed,
        paused: control.paused,
        connection_state: connectionState({
          managed,
          tmuxSession,
          liveSessionNames,
        }),
        activity_state: activityState,
        tmux_session: tmuxSession,
        mcp_status: "unknown",
        hook_status: "unknown",
        context: unknownContext(),
        access: accessStatus({
          runtimeId,
          mode: control.access_mode,
        }),
        pending_access_count: pendingAccessCount,
      });
    }

    agents.sort((a, b) => a.display_name.localeCompare(b.display_name));
    return {
      agents,
      capabilities: RUNTIME_CONTROL_CAPABILITIES,
    };
  }

  async function buildStatusRow(
    participantId: string,
  ): Promise<AgentStatusRow | null> {
    const status = await buildStatusRows();
    return status.agents.find((agent) => agent.participant_id === participantId) ?? null;
  }

  async function controlResponse(
    participantId: string,
    reply: import("fastify").FastifyReply,
  ): Promise<ManagedAgentControlResponse | { error: string }> {
    const agent = await buildStatusRow(participantId);
    if (agent === null) {
      reply.code(404);
      return { error: `agent not found: ${participantId}` };
    }
    return { agent };
  }

  async function publishAgentUpdated(participantId: string): Promise<void> {
    const agent = await buildStatusRow(participantId);
    if (agent === null) return;
    bus.publish({
      type: "managed-agent.updated",
      agent,
    });
  }

  async function findOpenAccessRequest(input: {
    p: Paths;
    sessionId: string;
    participantId: string;
    requestId: string;
  }): Promise<AccessRequestPayload | null> {
    const events = await readEvents(input.p, input.sessionId, {
      kinds: ["access-request", "access-response"],
    });
    const hasResponse = events.some(
      (event) =>
        isAccessResponse(event) &&
        event.payload.request_id === input.requestId,
    );
    if (hasResponse) return null;
    const request = events
      .filter(isOpenAccessRequest)
      .find(
        (event) =>
          event.participant_id === input.participantId &&
          event.payload.request_id === input.requestId,
      );
    return request?.payload ?? null;
  }

  async function deliverTerminalAccessDecision(input: {
    agent: AgentStatusRow;
    decision: ManagedAccessResponseRequest["decision"];
  }): Promise<{ delivered: true } | { delivered: false; error: string }> {
    if (input.agent.tmux_session === null) {
      return { delivered: false, error: "agent pane is not connected" };
    }
    if (input.agent.connection_state !== "connected") {
      return { delivered: false, error: "agent pane is not connected" };
    }
    if (input.agent.runtime_id !== "gemini") {
      return {
        delivered: false,
        error: "terminal access responses are only verified for Gemini",
      };
    }
    await inputQueue.enqueue(input.agent.tmux_session, async () => {
      if (input.decision === "approve") {
        await tmux.sendKey(input.agent.tmux_session!, "C-m");
      } else {
        await tmux.sendLiteralText(input.agent.tmux_session!, "3");
        await tmux.sendKey(input.agent.tmux_session!, "C-m");
      }
    });
    return { delivered: true };
  }

  async function writeManagedAccessResponse(input: {
    p: Paths;
    sessionId: string;
    participantId: string;
    body: ManagedAccessResponseRequest;
    request: AccessRequestPayload;
    delivered: boolean;
    delivery: AccessResponsePayload["delivery"];
    status: AccessResponsePayload["status"];
    decision: AccessResponsePayload["decision"];
    error?: string;
  }): Promise<ManagedAccessResponseResponse> {
    const written = await writeAccessResponseEvent(input.p, input.sessionId, {
      participant_id: input.body.participant_id,
      schema: "fmark.access-response.v1",
      request_id: input.request.request_id,
      decision: input.decision,
      status: input.status,
      delivered: input.delivered,
      delivery: input.delivery,
      ...(input.body.message !== undefined ? { message: input.body.message } : {}),
      ...(input.error !== undefined ? { error: input.error } : {}),
      responded_at: new Date().toISOString(),
    });
    publishEventWrites(bus, input.sessionId, written.publish);
    await agentState().updateControlState(input.participantId, {
      activity_state: "idle",
    });
    await publishAgentUpdated(input.participantId);
    return {
      ok: true,
      request_id: input.request.request_id,
      filename: written.response.filename,
      delivered: input.delivered,
      status: input.status,
      delivery: input.delivery,
      ...(input.error !== undefined ? { error: input.error } : {}),
    };
  }

  app.get<{ Querystring: { session_id?: string } }>(
    "/managed-agents/status",
    async (req) => buildStatusRows(req.query.session_id),
  );

  app.post<{ Params: { id: string } }>(
    "/managed-agents/:id/pause",
    async (req, reply) => {
      const id = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(id)) {
        reply.code(400);
        return { error: "invalid id" };
      }
      const state = agentState();
      await state.updateControlState(id, { paused: true });
      await state.appendLog(id, { event: "pause" });
      await publishAgentUpdated(id);
      return controlResponse(id, reply);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/managed-agents/:id/resume",
    async (req, reply) => {
      const id = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(id)) {
        reply.code(400);
        return { error: "invalid id" };
      }
      const state = agentState();
      await state.updateControlState(id, { paused: false });
      await state.appendLog(id, { event: "resume" });
      await publishAgentUpdated(id);
      return controlResponse(id, reply);
    },
  );

  app.patch<{
    Params: { id: string };
    Body: ManagedAgentRenameRequest;
  }>("/managed-agents/:id", async (req, reply) => {
    const id = decodeURIComponent(req.params.id);
    if (!isValidParticipantId(id)) {
      reply.code(400);
      return { error: "invalid id" };
    }
    const displayName = req.body?.display_name;
    if (typeof displayName !== "string" || displayName.trim().length === 0) {
      reply.code(400);
      return { error: "display_name required" };
    }
    try {
      await updateParticipant(routePaths(), id, { name: displayName });
      await agentState().appendLog(id, { event: "rename" });
      await publishAgentUpdated(id);
      return controlResponse(id, reply);
    } catch (err) {
      reply.code(/not found/i.test(String(err)) ? 404 : 400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.get<{ Params: { id: string } }>(
    "/managed-agents/:id/context",
    async (req, reply) => {
      const id = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(id)) {
        reply.code(400);
        return { error: "invalid id" };
      }
      const agent = await buildStatusRow(id);
      if (agent === null) {
        reply.code(404);
        return { error: `agent not found: ${id}` };
      }
      return agent.context;
    },
  );

  app.get<{ Params: { id: string } }>(
    "/managed-agents/:id/access",
    async (req, reply) => {
      const id = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(id)) {
        reply.code(400);
        return { error: "invalid id" };
      }
      const agent = await buildStatusRow(id);
      if (agent === null) {
        reply.code(404);
        return { error: `agent not found: ${id}` };
      }
      return agent.access;
    },
  );

  app.patch<{
    Params: { id: string };
    Body: ManagedAgentAccessPatch;
  }>("/managed-agents/:id/access", async (req, reply) => {
    const id = decodeURIComponent(req.params.id);
    if (!isValidParticipantId(id)) {
      reply.code(400);
      return { error: "invalid id" };
    }
    const agent = await buildStatusRow(id);
    if (agent === null) {
      reply.code(404);
      return { error: `agent not found: ${id}` };
    }
    const mode = req.body?.mode;
    if (typeof mode !== "string" || mode.length === 0) {
      reply.code(400);
      return { error: "mode required" };
    }
    if (!agent.access.change_supported) {
      reply.code(409);
      return {
        error:
          agent.access.reason ??
          "live access changes are not verified for this runtime",
      };
    }
    await agentState().updateControlState(id, { access_mode: mode });
    await publishAgentUpdated(id);
    return controlResponse(id, reply);
  });

  app.post<{
    Params: { id: string; requestId: string };
    Body: ManagedAccessResponseRequest;
  }>(
    "/managed-agents/:id/access-requests/:requestId/respond",
    {
      schema: {
        params: {
          type: "object",
          required: ["id", "requestId"],
          properties: {
            id: { type: "string", minLength: 1 },
            requestId: { type: "string", minLength: 1 },
          },
        },
        body: {
          type: "object",
          required: ["session_id", "participant_id", "decision"],
          additionalProperties: false,
          properties: {
            session_id: { type: "string", minLength: 1 },
            participant_id: { type: "string", minLength: 1 },
            decision: { enum: ["approve", "deny"] },
            message: { type: "string" },
          },
        },
      },
    },
    async (
      req,
      reply,
    ): Promise<ManagedAccessResponseResponse | { error: string }> => {
      const id = decodeURIComponent(req.params.id);
      const requestId = decodeURIComponent(req.params.requestId);
      if (!isValidParticipantId(id)) {
        reply.code(400);
        return { error: "invalid id" };
      }
      if (!isValidParticipantId(req.body.participant_id)) {
        reply.code(400);
        return { error: "invalid participant_id" };
      }
      const p = routePaths();
      if (!(await sessionExists(p, req.body.session_id))) {
        reply.code(404);
        return { error: `session not found: ${req.body.session_id}` };
      }
      const agent = await buildStatusRow(id);
      if (agent === null) {
        reply.code(404);
        return { error: `agent not found: ${id}` };
      }
      const request = await findOpenAccessRequest({
        p,
        sessionId: req.body.session_id,
        participantId: id,
        requestId,
      });
      if (request === null) {
        reply.code(409);
        return { error: "access request is not open" };
      }

      if (request.response_channel === "hook") {
        return writeManagedAccessResponse({
          p,
          sessionId: req.body.session_id,
          participantId: id,
          body: req.body,
          request,
          delivered: true,
          delivery: "hook",
          status: responseStatus(req.body.decision),
          decision: req.body.decision,
        });
      }

      if (request.response_channel === "terminal") {
        const delivery = await deliverTerminalAccessDecision({
          agent,
          decision: req.body.decision,
        });
        if (!delivery.delivered) {
          return writeManagedAccessResponse({
            p,
            sessionId: req.body.session_id,
            participantId: id,
            body: req.body,
            request,
            delivered: false,
            delivery: "none",
            status: statusFromExpired(),
            decision: "expired",
            error: delivery.error,
          });
        }
        return writeManagedAccessResponse({
          p,
          sessionId: req.body.session_id,
          participantId: id,
          body: req.body,
          request,
          delivered: true,
          delivery: "terminal",
          status: responseStatus(req.body.decision),
          decision: req.body.decision,
        });
      }

      return writeManagedAccessResponse({
        p,
        sessionId: req.body.session_id,
        participantId: id,
        body: req.body,
        request,
        delivered: false,
        delivery: "none",
        status: statusFromExpired(),
        decision: "expired",
        error: "access request has no live response channel",
      });
    },
  );

  async function sendRuntimeControl(
    id: string,
    action: RuntimeControlAction,
    reply: import("fastify").FastifyReply,
  ): Promise<ManagedAgentControlResponse | { error: string }> {
    const agent = await buildStatusRow(id);
    if (agent === null) {
      reply.code(404);
      return { error: `agent not found: ${id}` };
    }
    if (!controlAllowed(agent.activity_state)) {
      reply.code(409);
      return { error: `agent is ${agent.activity_state}` };
    }
    if (agent.tmux_session === null || agent.connection_state !== "connected") {
      reply.code(409);
      return { error: "agent pane is not connected" };
    }
    const command = runtimeControlCommand(agent.runtime_id, action);
    if (command === null) {
      reply.code(400);
      return { error: `${action} is unsupported for this runtime` };
    }
    await inputQueue.enqueue(agent.tmux_session, async () => {
      await tmux.sendLiteralText(agent.tmux_session!, command);
      await tmux.sendKey(agent.tmux_session!, "C-m");
    });
    await agentState().appendLog(id, { event: action, command });
    await publishAgentUpdated(id);
    return controlResponse(id, reply);
  }

  app.post<{ Params: { id: string } }>(
    "/managed-agents/:id/compact",
    async (req, reply) => {
      const id = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(id)) {
        reply.code(400);
        return { error: "invalid id" };
      }
      return sendRuntimeControl(id, "compact", reply);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/managed-agents/:id/clear",
    async (req, reply) => {
      const id = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(id)) {
        reply.code(400);
        return { error: "invalid id" };
      }
      const result = await sendRuntimeControl(id, "clear", reply);
      if (!("agent" in result)) return result;
      if (result.agent.runtime_session !== null) {
        await agentState().writeRuntimeSession(id, {
          ...result.agent.runtime_session,
          desired_name: result.agent.active_session,
        });
      }
      return controlResponse(id, reply);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/managed-agents/:id/reconnect",
    async (req, reply) => {
      const id = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(id)) {
        reply.code(400);
        return { error: "invalid id" };
      }
      const state = agentState();
      const current = await buildStatusRow(id);
      if (current === null) {
        reply.code(404);
        return { error: `agent not found: ${id}` };
      }
      if (current.connection_state === "connected") {
        tracker.setManagedPane(id, { paneAlive: () => true });
        return { agent: current };
      }
      const runtimeId = current.runtime_id ?? (await state.readRuntime(id));
      if (runtimeId === null) {
        reply.code(409);
        return { error: "agent has no runtime_id" };
      }
      const runtimes = await loadRuntimeRegistry({
        fallback: paths,
        ref: deps.pathContextRef,
      });
      const runtime = runtimes.runtimes[runtimeId];
      if (runtime === undefined) {
        reply.code(400);
        return { error: `unknown runtime_id: ${runtimeId}` };
      }
      const p = routePaths();
      const prompt = buildWakePrompt(
        buildCompassPacket({
          sessionId: current.active_session ?? "unlinked",
          participantId: id,
          cursorBefore: null,
          events: [],
        }),
      );
      const spawnArgs = spawnArgsForRuntime({
        runtimeId,
        args: runtime.args,
        desiredName: current.active_session,
        launchPrompt: prompt,
      });
      const { sessionName } = await tmux.spawnAgent({
        participantId: id,
        executable: runtime.executable,
        args: spawnArgs.args,
        env: {
          ...(runtime.env ?? {}),
          F_MARK_RUNTIME_ID: runtimeId,
          F_MARK_PATH: p.root(),
          ...(current.active_session !== null
            ? { F_MARK_SESSION_ID: current.active_session }
            : {}),
        },
      });
      await state.writeTmuxSession(id, sessionName);
      await state.writeRuntime(id, runtimeId);
      await state.writeRuntimeSession(id, {
        desired_name: current.active_session,
        native_name_applied: spawnArgs.nativeNameApplied,
      });
      tracker.setManagedPane(id, { paneAlive: () => true });
      await state.appendLog(id, { event: "reconnect", tmux_session: sessionName });
      const readyDelayMs = runtime.readyDelayMs ?? 0;
      const fireReconnectPrompt = async (): Promise<void> => {
        await waitForRuntimeReady({
          tmux,
          sessionName,
          runtimeId,
          timeoutMs: readyDelayMs,
        });
        await inputQueue.enqueue(sessionName, async () => {
          await tmux.sendLiteralText(sessionName, prompt);
          await tmux.sendKey(sessionName, "C-m");
        });
      };
      if (spawnArgs.launchPromptDelivery === "tmux" && readyDelayMs > 0) {
        setTimeout(() => {
          void fireReconnectPrompt().catch(() => {
            /* best-effort */
          });
        }, readyDelayMs).unref?.();
      } else if (spawnArgs.launchPromptDelivery === "tmux") {
        await fireReconnectPrompt();
      }
      await publishAgentUpdated(id);
      return controlResponse(id, reply);
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: { participant_id?: string; limit?: string };
  }>("/sessions/:id/inbox", async (req, reply) => {
    const sessionId = decodeURIComponent(req.params.id);
    const participantId = req.query.participant_id;
    if (typeof participantId !== "string" || !isValidParticipantId(participantId)) {
      reply.code(400);
      return { error: "valid participant_id required" };
    }
    const p = routePaths();
    if (!(await sessionExists(p, sessionId))) {
      reply.code(404);
      return { error: `session not found: ${sessionId}` };
    }
    let limit: number | undefined;
    if (req.query.limit !== undefined) {
      const parsed = Number(req.query.limit);
      if (!Number.isInteger(parsed) || parsed < 1) {
        reply.code(400);
        return { error: "limit must be a positive integer" };
      }
      limit = Math.min(parsed, 100);
    }
    const snapshot = await readInbox({
      paths: p,
      state: agentState(),
      sessionId,
      participantId,
      limit,
      markSeen: true,
    });
    await agentState().updateControlState(participantId, {
      activity_state: "idle",
    });
    await publishAgentUpdated(participantId);
    return publicInboxResponse(snapshot);
  });

  app.post<{
    Params: { id: string };
    Body: MarkSeenRequest;
  }>("/sessions/:id/mark-seen", async (req, reply): Promise<MarkSeenResponse | { error: string }> => {
    const sessionId = decodeURIComponent(req.params.id);
    const participantId = req.body?.participant_id;
    if (typeof participantId !== "string" || !isValidParticipantId(participantId)) {
      reply.code(400);
      return { error: "valid participant_id required" };
    }
    const p = routePaths();
    if (!(await sessionExists(p, sessionId))) {
      reply.code(404);
      return { error: `session not found: ${sessionId}` };
    }
    const cursor = await markInboxSeen({
      paths: p,
      state: agentState(),
      sessionId,
      participantId,
      timestamp: req.body?.timestamp,
    });
    return { session_id: sessionId, participant_id: participantId, cursor };
  });

  app.post<{
    Params: { id: string };
    Body: WakeSessionRequest;
  }>("/sessions/:id/wake", async (req, reply): Promise<WakeSessionResponse | { error: string }> => {
    const sessionId = decodeURIComponent(req.params.id);
    const p = routePaths();
    if (!(await sessionExists(p, sessionId))) {
      reply.code(404);
      return { error: `session not found: ${sessionId}` };
    }

    const state = agentState();
    const managedIds = await state.listManagedAgentIds();
    const managed = new Set(managedIds);
    const liveSessions = new Set(
      (await tmux.listFmarkSessions()).map((session) => session.sessionName),
    );
    const body = (req.body ?? {}) as {
      target_participant_ids?: unknown;
      reason?: WakeSessionRequest["reason"];
      source_event?: string;
    };
    const requested = body.target_participant_ids;
    if (requested !== undefined && !Array.isArray(requested)) {
      reply.code(400);
      return { error: "target_participant_ids must be an array" };
    }
    const targetIds =
      requested !== undefined
        ? [...new Set(requested.map((value) => String(value)))]
        : managedIds;
    const delivered: WakeSessionResponse["delivered"] = [];
    const skipped: WakeSessionResponse["skipped"] = [];

    for (const participantId of targetIds) {
      if (!isValidParticipantId(participantId)) {
        skipped.push({ participant_id: participantId, reason: "invalid-target" });
        continue;
      }
      if (!managed.has(participantId)) {
        skipped.push({ participant_id: participantId, reason: "not-managed" });
        continue;
      }
      const activeSession = await state.readActiveSession(participantId);
      if (activeSession !== sessionId) {
        if (requested !== undefined) {
          skipped.push({
            participant_id: participantId,
            reason: "not-active",
            detail: activeSession ?? "no active session",
          });
        }
        continue;
      }
      const control = await state.readControlState(participantId);
      if (control.paused) {
        skipped.push({ participant_id: participantId, reason: "paused" });
        continue;
      }
      const tmuxSession = await state.readTmuxSession(participantId);
      if (tmuxSession === null || !liveSessions.has(tmuxSession)) {
        skipped.push({ participant_id: participantId, reason: "pane-dead" });
        continue;
      }

      const snapshot = await readInbox({
        paths: p,
        state,
        sessionId,
        participantId,
        markSeen: false,
      });
      const packet = buildCompassPacket({
        sessionId,
        participantId,
        reason: body.reason,
        sourceEvent: body.source_event,
        cursorBefore: snapshot.cursor_before,
        events: snapshot.events,
      });
      const prompt = buildWakePrompt(packet);
      await inputQueue.enqueue(tmuxSession, async () => {
        await tmux.sendLiteralText(tmuxSession, prompt);
        await tmux.sendKey(tmuxSession, "C-m");
      });
      delivered.push({
        participant_id: participantId,
        tmux_session: tmuxSession,
        cursor_before: snapshot.cursor_before,
        cursor_after: packet.cursor_after,
        event_count: packet.event_count,
      });
      await state.updateControlState(participantId, {
        activity_state: "notified",
      });
      await publishAgentUpdated(participantId);
    }

    return {
      session_id: sessionId,
      notified: delivered.map((agent) => agent.participant_id),
      delivered,
      skipped,
      event_count: delivered.reduce((sum, agent) => sum + agent.event_count, 0),
    };
  });

  app.post<{ Body: Partial<SpawnRequest> }>("/managed-agents/spawn", async (req, reply) => {
    const body = (req.body ?? {}) as Partial<SpawnRequest>;
    const runtime_id = body.runtime_id;
    if (typeof runtime_id !== "string" || runtime_id.length === 0) {
      reply.code(400);
      return { error: "runtime_id required" };
    }
    const p = routePaths();
    await ensureProjectAuth(p, deps.authToken ?? null);
    const state = agentState();
    let runtimes;
    try {
      runtimes = await loadRuntimeRegistry({
        fallback: paths,
        ref: deps.pathContextRef,
      });
    } catch {
      reply.code(500);
      return { error: "failed to load runtimes" };
    }
    const runtime = runtimes.runtimes[runtime_id];
    if (!runtime) {
      reply.code(400);
      return { error: `unknown runtime_id: ${runtime_id}` };
    }
    const participantId =
      body.suggested_participant_id ??
      `ag-${runtime_id.slice(0, 8)}-${randomBytes(2).toString("hex")}`;
    if (!isValidParticipantId(participantId)) {
      reply.code(400);
      return { error: "invalid participant_id" };
    }
    if (body.session_id !== undefined) {
      if (typeof body.session_id !== "string" || body.session_id.length === 0) {
        reply.code(400);
        return { error: "session_id must be a non-empty string" };
      }
      if (!(await sessionExists(p, body.session_id))) {
        reply.code(404);
        return { error: `session not found: ${body.session_id}` };
      }
    }
    let mcpStatus: SpawnSetupStatus = "unknown";
    let hooksStatus: SpawnSetupStatus = "unknown";
    const userParticipantId = await firstUserParticipantId(p);
    try {
      const setup = await preflightIntegration({
        runtimeId: runtime_id,
        participantId,
        userParticipantId,
        projectRoot: p.root(),
        env: process.env,
      });
      mcpStatus = setup.mcp.status;
      hooksStatus = setup.hooks.status;
    } catch {
      // Spawn remains a compatibility fallback; setup UI should call
      // preflight/apply before spawn when it needs blocking behavior.
    }
    try {
      const detect = await hookStatusCheck({
        runtimeId: runtime_id,
        participantId,
        userParticipantId,
        projectRoot: p.root(),
      });
      if (detect.installed) {
        hooksStatus = "installed";
      } else if (detect.expectedEntries.length > 0) {
        hooksStatus = "missing";
      } else {
        hooksStatus = "not_required";
      }
    } catch {
      // Keep the preflight-derived status when the lightweight hook probe fails.
    }
    const knownRuntimeIds = new Set(Object.keys(runtimes.runtimes));
    try {
      await registerAgent(p, {
        name: body.name ?? randomizedDisplayName(runtime.displayName),
        suggested_id: participantId,
        runtime_id,
        knownRuntimeIds,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("already registered")) {
        reply.code(400);
        return { error: msg };
      }
      // Reuse existing participant — backfill runtime_id in case it was
      // registered before the field existed or under a different runtime.
      await setParticipantRuntime(p, participantId, runtime_id, knownRuntimeIds);
    }
    const desiredName = body.session_id ?? null;
    const runtimeSession: RuntimeSessionInfo = {
      desired_name: desiredName,
      native_name_applied: false,
    };
    const launchPrompt = buildLaunchPrompt({
      sessionId: body.session_id,
      participantId,
      userParticipantId: userParticipantId ?? "us-yourname",
      runtimeId: runtime_id,
      projectRoot: p.root(),
      mcpStatus,
      hooksStatus,
    });
    const spawnArgs = spawnArgsForRuntime({
      runtimeId: runtime_id,
      args: runtime.args,
      desiredName,
      launchPrompt,
    });
    runtimeSession.native_name_applied = spawnArgs.nativeNameApplied;
    const { sessionName } = await tmux.spawnAgent({
      participantId,
      executable: runtime.executable,
      args: spawnArgs.args,
      env: {
        ...(runtime.env ?? {}),
        F_MARK_RUNTIME_ID: runtime_id,
        F_MARK_PATH: p.root(),
        ...(body.session_id !== undefined
          ? { F_MARK_SESSION_ID: body.session_id }
          : {}),
      },
    });
    // After a successful tmux spawn we have external state (the tmux session).
    // If any subsequent write fails the route would otherwise return 500 and
    // leave an orphan tmux session behind. Roll back by killing the session
    // before re-raising.
    try {
      await state.writeTmuxSession(participantId, sessionName);
      await state.writeRuntime(participantId, runtime_id);
      await state.writeRuntimeSession(participantId, runtimeSession);
      if (body.session_id !== undefined) {
        await state.writeActiveSession(participantId, body.session_id);
      }
      // v0.4: optimistic paneAlive — the presence ticker / pane-died detection
      // happens elsewhere. We pass a closure that returns true so the tracker
      // bucket exists; downstream code can replace this when it has authoritative
      // pane state.
      tracker.setManagedPane(participantId, { paneAlive: () => true });
      await state.appendLog(participantId, {
        event: "spawn",
        runtime: runtime_id,
        tmux_session: sessionName,
        runtime_session: runtimeSession,
      });
    } catch (err) {
      try {
        await tmux.killSession(sessionName);
      } catch {
        // best-effort cleanup; surface the original write failure
      }
      throw err;
    }

    // Hook install detection + presence seeding. Best-effort: if the runtime
    // is unknown to the detector (or the detector throws on a transient IO
    // error), fall back to "unknown" rather than failing the whole spawn.
    try {
      const detect = await hookStatusCheck({
        runtimeId: runtime_id,
        participantId,
        userParticipantId,
        projectRoot: p.root(),
      });
      const hooksRequired = detect.expectedEntries.length > 0;
      if (detect.installed) {
        tracker.setManagedHookStatus(participantId, true);
        hooksStatus = "installed";
      } else if (hooksRequired) {
        tracker.setManagedHookStatus(participantId, false);
        hooksStatus = "missing";
      } else {
        tracker.markReconciledStale(participantId, { paneAlive: () => true });
        hooksStatus = "not_required";
      }
    } catch {
      // Detection failed — leave status "unknown" and presence untouched.
    }

    const readyDelayMs = runtime.readyDelayMs ?? 0;
    const fireLaunchPrompt = async (): Promise<void> => {
      await waitForRuntimeReady({
        tmux,
        sessionName,
        runtimeId: runtime_id,
        timeoutMs: readyDelayMs,
      });
      await inputQueue.enqueue(sessionName, async () => {
        await tmux.sendLiteralText(sessionName, launchPrompt);
        await tmux.sendKey(sessionName, "C-m");
      });
    };
    if (spawnArgs.launchPromptDelivery === "tmux" && readyDelayMs > 0) {
      // Defer until the runtime is likely listening on stdin. The route
      // response returns promptly; the shared per-pane input queue prevents
      // interleaving with overlay-typed input.
      setTimeout(() => {
        void fireLaunchPrompt().catch(() => {
          /* best-effort */
        });
      }, readyDelayMs).unref?.();
    } else if (spawnArgs.launchPromptDelivery === "tmux") {
      await fireLaunchPrompt();
    }

    // active-session was written above when body.session_id was provided;
    // surface it on the response + broadcast so the renderer can scope the
    // chip strip to the current session without a /participants refetch.
    const activeSession = body.session_id ?? null;

    // Publish managed-agent.spawned for the renderer chip strip.
    bus.publish({
      type: "managed-agent.spawned",
      participant_id: participantId,
      tmux_session: sessionName,
      runtime_id,
      active_session: activeSession,
    });

    return {
      participant_id: participantId,
      tmux_session: sessionName,
      runtime_id,
      active_session: activeSession,
      mcp_status: mcpStatus,
      hooks_status: hooksStatus,
      runtime_session: runtimeSession,
    };
  });

  app.get<{ Params: { id: string } }>(
    "/managed-agents/:id/confirm-token",
    async (req, reply) => {
      const id = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(id)) {
        reply.code(400);
        return { error: "invalid id" };
      }
      return { token: mintConfirm(id) };
    },
  );

  app.delete<{ Params: { id: string }; Querystring: { confirm?: string } }>(
    "/managed-agents/:id",
    async (req, reply) => {
      const id = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(id)) {
        reply.code(400);
        return { error: "invalid id" };
      }
      const confirm = req.query.confirm;
      if (!confirm || !consumeConfirm(id, confirm)) {
        reply.code(403);
        return { error: "missing or stale confirm token" };
      }
      const state = agentState();
      const session = await state.readTmuxSession(id);
      if (session) {
        try {
          await tmux.killSession(session);
        } catch {
          // tolerate already-dead session — the goal is to clear state
        }
      }
      await state.clearManagedSiblings(id);
      tracker.clearManagedPane(id);
      await state.appendLog(id, { event: "goodbye" });
      bus.publish({ type: "managed-agent.killed", participant_id: id });
      return { ok: true };
    },
  );

  app.post<{ Body: SpawnTerminalRequest }>("/managed-agents/terminal", async (req) => {
    const sessions = await tmux.listFmarkSessions();
    const existing = sessions.filter((s) => s.kind === "terminal");
    const maxIdx = existing.reduce((m, s) => Math.max(m, s.index ?? 0), 0);
    const index = maxIdx + 1;
    const { sessionName } = await tmux.spawnTerminal({ index });
    const name = req.body?.name;
    const label = typeof name === "string" && name.length > 0 ? name : `terminal ${index}`;
    bus.publish({
      type: "managed-agent.terminal-spawned",
      tmux_session: sessionName,
      label,
    });
    return { tmux_session: sessionName, label, index };
  });

  app.get("/managed-agents", async () => {
    const state = agentState();
    const sessions = await tmux.listFmarkSessions();
    const liveSessionNames = new Set(sessions.map((s) => s.sessionName));
    const agentIds = await state.listManagedAgentIds();
    const agents: Array<{
      participant_id: string;
      tmux_session: string | null;
      runtime_id: string | null;
      runtime_session: RuntimeSessionInfo | null;
      alive: boolean;
    }> = [];
    for (const aid of agentIds) {
      const tmuxSession = await state.readTmuxSession(aid);
      const runtimeId = await state.readRuntime(aid);
      const runtimeSession = await state.readRuntimeSession(aid);
      // alive iff the recorded tmux session is in the live-sessions set.
      // Stale agent directories (session died, files left behind) are still
      // surfaced — the UI can use alive=false to offer "Reconnect" or cleanup.
      const alive = tmuxSession !== null && liveSessionNames.has(tmuxSession);
      agents.push({
        participant_id: aid,
        tmux_session: tmuxSession,
        runtime_id: runtimeId,
        runtime_session: runtimeSession,
        alive,
      });
    }
    const terminals = sessions
      .filter((s) => s.kind === "terminal")
      .map((s) => ({
        tmux_session: s.sessionName,
        label: `terminal ${s.index}`,
        index: s.index,
      }));
    return { agents, terminals };
  });

  app.get<{ Params: { id: string }; Querystring: { since?: string } }>(
    "/managed-agents/:id/logs",
    async (req, reply) => {
      const id = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(id)) {
        reply.code(400);
        return { error: "invalid id" };
      }
      const limitRaw = req.query.since;
      const limit = limitRaw !== undefined ? Number(limitRaw) : 50;
      const entries = await agentState().readLog(id, { limit });
      return { entries };
    },
  );

  app.post<{
    Params: { id: string };
    Body: Partial<ManagedAgentCommandRequest>;
  }>("/managed-agents/:id/command", async (req, reply) => {
    const id = decodeURIComponent(req.params.id);
    if (!isValidParticipantId(id)) {
      reply.code(400);
      return { error: "invalid id" };
    }
    const state = agentState();
    const session = await state.readTmuxSession(id);
    if (!session) {
      reply.code(409);
      return { reason: "unmanaged_pane", offer: "open_overlay" };
    }
    const body = (req.body ?? {}) as Partial<ManagedAgentCommandRequest>;
    try {
      if (body.type === "interrupt") {
        await inputQueue.enqueue(session, () => tmux.sendKey(session, "C-c"));
      } else if (body.type === "slash") {
        if (typeof body.command !== "string") {
          reply.code(400);
          return { error: "missing command" };
        }
        validateSlashCommand(body.command);
        const cmd = body.command;
        await inputQueue.enqueue(session, async () => {
          await tmux.sendLiteralText(session, "/" + cmd);
          await tmux.sendKey(session, "C-m");
        });
      } else if (body.type === "message") {
        if (typeof body.text !== "string") {
          reply.code(400);
          return { error: "missing text" };
        }
        validateMessageText(body.text);
        const text = body.text;
        await inputQueue.enqueue(session, async () => {
          await tmux.sendLiteralText(session, text);
          await tmux.sendKey(session, "C-m");
        });
      } else {
        reply.code(400);
        return { error: "unknown command type" };
      }
      await state.appendLog(id, {
        event: "command",
        type: body.type,
      });
      return { ok: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      reply.code(400);
      return { error: msg };
    }
  });
}
