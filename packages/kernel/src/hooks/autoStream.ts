import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "node:path";
import {
  readActiveSession,
  writeActiveSession,
} from "../agents/activeSession.js";
import { paths as makePaths } from "../paths.js";
import {
  isValidParticipantId,
  readParticipants,
  registerAgent,
} from "../participants.js";
import { listSessions, sessionExists } from "../sessions.js";
import { loadHookContext } from "./bootstrap.js";
import { postPing, postProjectedEvents } from "./post.js";
import { projectTurnToEvents } from "./projectTurn.js";
import { extractLastAssistantTurn } from "./transcript.js";

export type AutoStreamKind = "assistant" | "user";

interface AssistantStdin {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  stop_hook_active?: boolean;
}

interface UserStdin {
  cwd: string;
  hook_event_name: string;
  prompt?: string;
  user_input?: string;
}

interface AutoStreamAgentMap {
  version: string;
  sessions: Record<
    string,
    {
      participant_id: string;
      runtime_id: string;
      external_session_id: string;
      updated_at: string;
    }
  >;
}

interface AutoStreamOptions {
  env?: NodeJS.ProcessEnv;
}

const AGENT_MAP_VERSION = "1.0";

function agentMapPath(fmarkDir: string): string {
  return join(fmarkDir, "hooks", "auto-stream-agents.json");
}

async function readAgentMap(fmarkDir: string): Promise<AutoStreamAgentMap> {
  try {
    const parsed = JSON.parse(
      await readFile(agentMapPath(fmarkDir), "utf8"),
    ) as Partial<AutoStreamAgentMap>;
    if (
      parsed.sessions !== undefined &&
      parsed.sessions !== null &&
      typeof parsed.sessions === "object"
    ) {
      return {
        version: typeof parsed.version === "string" ? parsed.version : AGENT_MAP_VERSION,
        sessions: parsed.sessions as AutoStreamAgentMap["sessions"],
      };
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return { version: AGENT_MAP_VERSION, sessions: {} };
}

async function writeAgentMap(
  fmarkDir: string,
  map: AutoStreamAgentMap,
): Promise<void> {
  const file = agentMapPath(fmarkDir);
  await mkdir(join(fmarkDir, "hooks"), { recursive: true });
  await writeFile(file, `${JSON.stringify(map, null, 2)}\n`, "utf8");
}

function runtimeDisplayName(runtimeId: string): string {
  if (runtimeId === "claude") return "Claude";
  if (runtimeId === "codex") return "Codex";
  return runtimeId;
}

async function participantExists(
  projectRoot: string,
  participantId: string,
): Promise<boolean> {
  try {
    const participants = await readParticipants(makePaths(projectRoot));
    return participants[participantId]?.kind === "agent";
  } catch {
    return false;
  }
}

async function registerHookAgent(
  ctx: Awaited<ReturnType<typeof loadHookContext>>,
  runtimeId: string,
  externalSessionId: string,
): Promise<string> {
  const key = `${runtimeId}:${externalSessionId}`;
  const map = await readAgentMap(ctx.fmarkDir);
  const mapped = map.sessions[key]?.participant_id;
  if (
    typeof mapped === "string" &&
    isValidParticipantId(mapped) &&
    (await participantExists(ctx.path, mapped))
  ) {
    return mapped;
  }

  const p = makePaths(ctx.path);
  let created;
  try {
    created = await registerAgent(p, {
      name: runtimeDisplayName(runtimeId),
      runtime_id: runtimeId,
    });
  } catch (err) {
    const missingRuntimeRegistry =
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT";
    if (
      err instanceof Error &&
      !missingRuntimeRegistry &&
      !err.message.includes(`unknown runtime_id: ${runtimeId}`)
    ) {
      throw err;
    }
    created = await registerAgent(p, {
      name: runtimeDisplayName(runtimeId),
    });
  }

  map.sessions[key] = {
    participant_id: created.id,
    runtime_id: runtimeId,
    external_session_id: externalSessionId,
    updated_at: new Date().toISOString(),
  };
  await writeAgentMap(ctx.fmarkDir, map);
  return created.id;
}

async function resolveParticipantId(
  explicitParticipantId: string | null,
  kind: AutoStreamKind,
  payload: AssistantStdin | UserStdin,
  ctx: Awaited<ReturnType<typeof loadHookContext>>,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  if (explicitParticipantId !== null) return explicitParticipantId;

  const envParticipantId = env.F_MARK_AGENT_ID;
  if (typeof envParticipantId === "string" && envParticipantId.length > 0) {
    if (!isValidParticipantId(envParticipantId)) {
      process.stderr.write(
        `f-mark auto-stream: invalid F_MARK_AGENT_ID: ${envParticipantId}\n`,
      );
      return null;
    }
    return envParticipantId;
  }

  if (kind !== "assistant") {
    process.stderr.write(
      "f-mark auto-stream: no participant id for user hook; ignoring\n",
    );
    return null;
  }

  const runtimeId =
    typeof env.F_MARK_RUNTIME_ID === "string" &&
    env.F_MARK_RUNTIME_ID.trim().length > 0
      ? env.F_MARK_RUNTIME_ID.trim()
      : "claude";
  const externalSessionId =
    typeof (payload as AssistantStdin).session_id === "string"
      ? (payload as AssistantStdin).session_id.trim()
      : "";
  if (externalSessionId.length === 0) {
    process.stderr.write(
      "f-mark auto-stream: hook payload is missing session_id\n",
    );
    return null;
  }
  return registerHookAgent(ctx, runtimeId, externalSessionId);
}

async function resolveFmarkSessionId(
  ctx: Awaited<ReturnType<typeof loadHookContext>>,
  participantId: string,
  payload: AssistantStdin | UserStdin,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  const agentsDir = join(ctx.fmarkDir, "agents");
  const existing = await readActiveSession(agentsDir, participantId);
  if (existing) return existing;

  const p = makePaths(ctx.path);
  const payloadSessionIdRaw = (payload as { fmark_session_id?: unknown })
    .fmark_session_id;
  const payloadSessionId =
    typeof payloadSessionIdRaw === "string" ? payloadSessionIdRaw : null;
  const candidates = [env.F_MARK_SESSION_ID, payloadSessionId];
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      candidate.length > 0 &&
      (await sessionExists(p, candidate))
    ) {
      await writeActiveSession(agentsDir, participantId, candidate);
      return candidate;
    }
  }

  const sessions = await listSessions(p);
  const latest = sessions[0]?.id;
  if (latest !== undefined) {
    await writeActiveSession(agentsDir, participantId, latest);
    return latest;
  }
  return null;
}

export async function runAutoStream(
  explicitParticipantId: string | null,
  kind: AutoStreamKind,
  stdinRaw: string,
  options: AutoStreamOptions = {},
): Promise<number> {
  let payload: AssistantStdin | UserStdin;
  try {
    payload = JSON.parse(stdinRaw);
  } catch {
    process.stderr.write("f-mark auto-stream: invalid JSON on stdin\n");
    return 0;
  }

  const env = options.env ?? process.env;
  const cwd = (payload as { cwd?: string }).cwd ?? process.cwd();
  let ctx;
  try {
    ctx = await loadHookContext(cwd, env);
  } catch (err: any) {
    process.stderr.write(`f-mark auto-stream: ${err.message}\n`);
    return 0;
  }

  let participantId: string | null;
  try {
    participantId = await resolveParticipantId(
      explicitParticipantId,
      kind,
      payload,
      ctx,
      env,
    );
  } catch (err: any) {
    process.stderr.write(`f-mark auto-stream: ${err.message}\n`);
    return 0;
  }
  if (!participantId) return 0;

  const sessionId = await resolveFmarkSessionId(ctx, participantId, payload, env);
  if (!sessionId) {
    process.stderr.write(
      `f-mark auto-stream: no F-Mark session found for ${participantId}; create a session first\n`,
    );
    return 0;
  }

  await postPing(ctx, participantId);

  if (kind === "assistant") {
    const a = payload as AssistantStdin;
    if (a.stop_hook_active === true) return 0;
    let transcript: string;
    try {
      transcript = await readFile(a.transcript_path, "utf8");
    } catch (err: any) {
      process.stderr.write(
        `f-mark auto-stream: cannot read transcript ${a.transcript_path}: ${err.message}\n`,
      );
      return 0;
    }
    const blocks = extractLastAssistantTurn(transcript);
    const events = projectTurnToEvents(blocks);
    if (events.length === 0) return 0;
    await postProjectedEvents(ctx, participantId, sessionId, events);
    return 0;
  }

  // kind === "user"
  const u = payload as UserStdin;
  const text = (u.prompt ?? u.user_input ?? "").trim();
  if (!text) return 0;
  // User prompts post a single prose event and never emit turn-end (turns are
  // owned by assistants).
  try {
    await postProjectedEvents(
      ctx,
      participantId,
      sessionId,
      [{ kind: "prose", content: text, arbitrary: false }],
      { emitTurnEnd: false },
    );
  } catch (err: any) {
    process.stderr.write(`f-mark auto-stream: POST /events/prose → ${err.message}\n`);
  }
  return 0;
}
