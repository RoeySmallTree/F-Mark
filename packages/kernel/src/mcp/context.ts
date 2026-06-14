import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { findFmarkDir } from "../hooks/bootstrap.js";
import { createHookAgentStateStore } from "../services/agentState.js";
import { paths as makePaths } from "../paths.js";
import { sessionExists } from "../sessions.js";

export interface FmarkMcpContext {
  projectRoot: string;
  fmarkDir: string;
  kernelUrl: string;
  token: string | null;
  env: NodeJS.ProcessEnv;
}

export interface ResolveContextOptions {
  path?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ResolvedSessionContext extends FmarkMcpContext {
  sessionId: string;
  participantId?: string;
}

export interface ResolvedWriteContext extends FmarkMcpContext {
  sessionId: string;
  participantId: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readOptionalToken(fmarkDir: string): Promise<string | null> {
  try {
    const token = (await readFile(join(fmarkDir, ".token"), "utf8")).trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function normaliseOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

export async function resolveFmarkMcpContext(
  options: ResolveContextOptions = {},
): Promise<FmarkMcpContext> {
  const env = options.env ?? process.env;
  const explicitPath = normaliseOptional(options.path);
  const envPath = normaliseOptional(env.F_MARK_PATH);
  const cwd = resolve(options.cwd ?? process.cwd());

  let projectRoot: string | null = null;
  let fmarkDir: string | null = null;

  for (const candidate of [explicitPath, envPath]) {
    if (candidate === undefined) continue;
    const candidateFmark = join(candidate, ".f-mark");
    if (await exists(candidateFmark)) {
      projectRoot = candidate;
      fmarkDir = candidateFmark;
      break;
    }
  }

  if (fmarkDir === null) {
    fmarkDir = await findFmarkDir(cwd);
    if (fmarkDir !== null) projectRoot = dirname(fmarkDir);
  }

  if (fmarkDir === null || projectRoot === null) {
    throw new Error(
      "no .f-mark directory found; run inside a F-Mark project or pass --path",
    );
  }

  const cfg = JSON.parse(
    await readFile(join(fmarkDir, "config.json"), "utf8"),
  ) as { port?: number; host?: string };
  const port = cfg.port ?? 7777;
  const host = cfg.host ?? "localhost";
  return {
    projectRoot,
    fmarkDir,
    kernelUrl: `http://${host}:${port}`,
    token: await readOptionalToken(fmarkDir),
    env,
  };
}

async function resolveParticipantId(
  inputParticipantId: string | undefined,
  ctx: FmarkMcpContext,
): Promise<string | undefined> {
  const explicit = normaliseOptional(inputParticipantId);
  if (explicit !== undefined) return explicit;
  return normaliseOptional(ctx.env.F_MARK_AGENT_ID);
}

export async function resolveSessionContext(
  input: {
    session_id?: string;
    participant_id?: string;
  },
  options: ResolveContextOptions = {},
): Promise<ResolvedSessionContext> {
  const ctx = await resolveFmarkMcpContext(options);
  const participantId = await resolveParticipantId(input.participant_id, ctx);
  const explicitSession = normaliseOptional(input.session_id);
  if (explicitSession !== undefined) {
    return { ...ctx, sessionId: explicitSession, participantId };
  }

  if (participantId !== undefined) {
    const state = createHookAgentStateStore({
      projectRoot: ctx.projectRoot,
      fmarkDir: ctx.fmarkDir,
      env: ctx.env,
    });
    const active = await state.readActiveSession(participantId);
    if (active !== null && active.length > 0) {
      return { ...ctx, sessionId: active, participantId };
    }
  }

  const envSession = normaliseOptional(ctx.env.F_MARK_SESSION_ID);
  if (envSession !== undefined) {
    return { ...ctx, sessionId: envSession, participantId };
  }

  throw new Error(
    "no active F-Mark session; pass session_id or link this participant first",
  );
}

export async function resolveWriteContext(
  input: {
    session_id?: string;
    participant_id?: string;
  },
  options: ResolveContextOptions = {},
): Promise<ResolvedWriteContext> {
  const ctx = await resolveSessionContext(input, options);
  if (ctx.participantId === undefined) {
    throw new Error(
      "participant_id is required; pass participant_id or run with F_MARK_AGENT_ID",
    );
  }
  const p = makePaths(ctx.projectRoot);
  if (!(await sessionExists(p, ctx.sessionId))) {
    throw new Error(`session not found: ${ctx.sessionId}`);
  }
  const explicitSession = normaliseOptional(input.session_id);
  if (explicitSession !== undefined) {
    const state = createHookAgentStateStore({
      projectRoot: ctx.projectRoot,
      fmarkDir: ctx.fmarkDir,
      env: ctx.env,
    });
    const active = await state.readActiveSession(ctx.participantId);
    if (active !== null && active.length > 0 && active !== explicitSession) {
      throw new Error(
        `session_id ${explicitSession} does not match active session ${active} for participant ${ctx.participantId}`,
      );
    }
  }
  return { ...ctx, participantId: ctx.participantId };
}

export async function fmarkFetch(
  ctx: FmarkMcpContext,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (ctx.token !== null) headers.set("Authorization", `Bearer ${ctx.token}`);
  const response = await fetch(`${ctx.kernelUrl}${path}`, {
    ...init,
    headers,
  });
  const raw = await response.text();
  let parsed: unknown = raw;
  if (raw.length > 0) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} failed ${response.status}: ${
        typeof parsed === "string" ? parsed : JSON.stringify(parsed)
      }`,
    );
  }
  return parsed;
}
