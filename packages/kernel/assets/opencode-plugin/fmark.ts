// F-Mark opencode plugin. Managed by `f-mark integration apply --runtime opencode`.
// Version + sha256 lives in fmark.meta.json (sidecar). Do not edit by hand.
// Architecture notes live with the opencode hot-test reports in the F-Mark repo.

import type { Plugin } from "@opencode-ai/plugin";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const PLUGIN_VERSION = "phase-opencode-v1";
const PING_TIMEOUT_MS = 2000;
const ACCESS_RESPONSE_POLL_MS = 250;
const FMARK_MCP_TOOL_PREFIX = process.env.F_MARK_OPENCODE_MCP_PREFIX ?? "mcp__fmark__";

interface Ctx {
  fmarkDir: string;
  kernelUrl: string;
  token: string;
  projectPath: string;
  agentId: string;
}

async function findFmarkDir(start: string): Promise<string | null> {
  let cur = start;
  while (true) {
    const candidate = join(cur, ".f-mark");
    try {
      if ((await stat(candidate)).isDirectory()) return candidate;
    } catch {
      /* keep walking */
    }
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

async function loadCtx(cwd: string): Promise<Ctx | null> {
  const agentId = process.env.F_MARK_AGENT_ID;
  if (!agentId) return null;
  const envPath = process.env.F_MARK_PATH;
  let fmarkDir: string | null = null;
  let projectPath: string | null = null;
  if (envPath) {
    try {
      await stat(join(envPath, ".f-mark"));
      fmarkDir = join(envPath, ".f-mark");
      projectPath = envPath;
    } catch {
      /* fall through to upward walk */
    }
  }
  if (!fmarkDir) {
    fmarkDir = await findFmarkDir(cwd);
    if (!fmarkDir) return null;
    projectPath = dirname(fmarkDir);
  }
  const token = (await readFile(join(fmarkDir, ".token"), "utf8")).trim();
  const cfg = JSON.parse(await readFile(join(fmarkDir, "config.json"), "utf8")) as {
    port?: number;
    host?: string;
  };
  return {
    fmarkDir,
    agentId,
    projectPath: projectPath!,
    token,
    kernelUrl: `http://${cfg.host ?? "localhost"}:${cfg.port ?? 7777}`,
  };
}

async function httpJson<T = unknown>(
  ctx: Ctx,
  method: string,
  path: string,
  body?: unknown,
): Promise<T | null> {
  try {
    const res = await fetch(`${ctx.kernelUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      process.stderr.write(`f-mark plugin: ${method} ${path} -> ${res.status}\n`);
      return null;
    }
    const ct = res.headers.get("content-type") ?? "";
    return ct.includes("json") ? ((await res.json()) as T) : null;
  } catch (err) {
    process.stderr.write(
      `f-mark plugin: ${method} ${path} threw ${(err as Error).message}\n`,
    );
    return null;
  }
}

async function resolveValidatedFmarkSessionId(ctx: Ctx): Promise<string | null> {
  const candidates: string[] = [];
  try {
    const v = (
      await readFile(join(ctx.fmarkDir, "agents", ctx.agentId, "active-session"), "utf8")
    ).trim();
    if (v) candidates.push(v);
  } catch {
    /* missing is fine */
  }
  if (process.env.F_MARK_SESSION_ID) candidates.push(process.env.F_MARK_SESSION_ID);
  const res = await httpJson<{ sessions?: Array<{ id: string }> }>(ctx, "GET", `/sessions`);
  const known = new Set((res?.sessions ?? []).map((s) => s.id));
  for (const c of candidates) if (known.has(c)) return c;
  return res?.sessions?.[0]?.id ?? null;
}

async function awaitAccessResponse(
  ctx: Ctx,
  sessionId: string,
  requestId: string,
  timeoutMs: number,
): Promise<"approve" | "deny" | "expired"> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await httpJson<{
      events?: Array<{ kind: string; payload: Record<string, unknown> }>;
    }>(ctx, "GET", `/sessions/${sessionId}/events?kinds=access-response`);
    for (const e of res?.events ?? []) {
      if (
        e.payload?.request_id === requestId &&
        (e.payload.decision === "approve" || e.payload.decision === "deny")
      ) {
        return e.payload.decision as "approve" | "deny";
      }
    }
    await new Promise((r) => setTimeout(r, ACCESS_RESPONSE_POLL_MS));
  }
  return "expired";
}

// messageID → role, populated from event.message.updated. Used to filter
// assistant text out of event.message.part.updated (which fires for both sides).
const messageRole = new Map<string, "user" | "assistant" | "system">();

// Per-opencode-session "has content posted since last turn-end" — avoids empty turns.
const turnHasContent = new Map<string, boolean>();

// Permission request IDs already handled, so the bus event and TUI hook don't double-decide.
const permissionInFlight = new Map<string, Promise<"approve" | "deny" | "expired">>();

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pickPermissionResponse(
  decision: "approve" | "deny" | "expired",
): "always" | "once" | "reject" {
  if (decision === "approve") return "once";
  return "reject";
}

async function handlePermissionAsked(
  ctx: Ctx,
  client: any,
  permission: Record<string, unknown>,
): Promise<"approve" | "deny" | "expired"> {
  const permissionID = asString(permission.id);
  const opencodeSid = asString(permission.sessionID);
  if (!permissionID || !opencodeSid) return "expired";
  const existing = permissionInFlight.get(permissionID);
  if (existing) return existing;

  const work = (async (): Promise<"approve" | "deny" | "expired"> => {
    const sid = await resolveValidatedFmarkSessionId(ctx);
    if (!sid) return "expired";
    const tool = (permission.tool ?? {}) as Record<string, unknown>;
    const requestId = `ar-${permissionID}`;
    await httpJson(ctx, "POST", `/sessions/${sid}/events/access-request`, {
      participant_id: ctx.agentId,
      path: ctx.projectPath,
      schema: "fmark.access-request.v1",
      request_id: requestId,
      status: "open",
      request_type: "permission",
      runtime_id: "opencode",
      runtime_session_id: opencodeSid,
      title: asString(permission.permission) ?? "Permission request",
      message:
        asString(permission.permission) ??
        JSON.stringify(permission).slice(0, 800),
      tool_name: asString(tool.messageID) !== undefined ? "opencode-tool" : undefined,
      tool_input: { tool, patterns: permission.patterns, metadata: permission.metadata },
      response_channel: "hook",
      raw: permission,
      created_at: new Date().toISOString(),
    });
    const timeoutMs = Number(process.env.F_MARK_ACCESS_REQUEST_TIMEOUT_MS ?? "300000");
    const decision = await awaitAccessResponse(
      ctx,
      sid,
      requestId,
      Math.max(1000, timeoutMs),
    );
    if (decision !== "expired") {
      try {
        await client.postSessionIdPermissionsPermissionId({
          path: { id: opencodeSid, permissionID },
          body: { response: pickPermissionResponse(decision) },
        });
      } catch (err) {
        process.stderr.write(
          `f-mark plugin: permission reply failed: ${(err as Error).message}\n`,
        );
      }
    }
    return decision;
  })();
  permissionInFlight.set(permissionID, work);
  work.finally(() => permissionInFlight.delete(permissionID));
  return work;
}

export const FmarkPlugin: Plugin = async (input) => {
  const ctx = await loadCtx(input.directory ?? process.cwd());
  if (!ctx) {
    process.stderr.write(
      `f-mark plugin v${PLUGIN_VERSION}: F_MARK_AGENT_ID not set or .f-mark/ missing; idle\n`,
    );
    return {};
  }
  process.stderr.write(
    `f-mark plugin v${PLUGIN_VERSION}: agent=${ctx.agentId} kernel=${ctx.kernelUrl}\n`,
  );

  // Ping on load — fire-and-forget, short timeout
  fetch(`${ctx.kernelUrl}/agents/${ctx.agentId}/ping`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.token}`,
    },
    body: "{}",
    signal: AbortSignal.timeout(PING_TIMEOUT_MS),
  }).catch(() => {});

  return {
    event: async ({ event }) => {
      const t = (event as { type?: string }).type;
      const props =
        (event as { properties?: Record<string, unknown> }).properties ?? {};

      // Build messageID → role index
      if (t === "message.updated") {
        const info = (props.info ?? {}) as Record<string, unknown>;
        const id = asString(info.id);
        const role = asString(info.role);
        if (id && (role === "user" || role === "assistant" || role === "system")) {
          messageRole.set(id, role);
        }
        return;
      }

      // Assistant text
      if (t === "message.part.updated") {
        const part = (props.part ?? {}) as Record<string, unknown>;
        if (asString(part.type) !== "text") return;
        const time = (part.time ?? {}) as { end?: number };
        if (typeof time.end !== "number") return; // not finalized yet
        const messageID = asString(part.messageID);
        if (!messageID || messageRole.get(messageID) !== "assistant") return;
        const text = asString(part.text);
        if (!text) return;
        const opencodeSid = asString(props.sessionID) ?? asString(part.sessionID);
        const sid = await resolveValidatedFmarkSessionId(ctx);
        if (!sid) return;
        await httpJson(ctx, "POST", `/sessions/${sid}/events/prose`, {
          participant_id: ctx.agentId,
          content: text,
          arbitrary: false,
          source: "hook",
          path: ctx.projectPath,
        });
        if (opencodeSid) turnHasContent.set(opencodeSid, true);
        return;
      }

      // End of turn — gated on content
      if (t === "session.idle") {
        const opencodeSid = asString(props.sessionID);
        if (!opencodeSid) return;
        if (turnHasContent.get(opencodeSid) !== true) return;
        const sid = await resolveValidatedFmarkSessionId(ctx);
        if (!sid) return;
        await httpJson(ctx, "POST", `/sessions/${sid}/events/turn-end`, {
          participant_id: ctx.agentId,
          source: "hook",
          path: ctx.projectPath,
        });
        // Trigger kernel-side runtime-state probe via the OpenCode adapter
        // (queries `opencode db --format json` for this sessionID). Best-effort.
        await httpJson(
          ctx,
          "POST",
          `/managed-agents/${ctx.agentId}/runtime-state`,
          { runtime_session_id: opencodeSid, source: "opencode-db" },
        );
        turnHasContent.set(opencodeSid, false);
        return;
      }

      // Permission flow (universal — works in headless + TUI)
      if (t === "permission.asked") {
        void handlePermissionAsked(ctx, input.client, props as Record<string, unknown>);
      }
    },

    "tool.execute.after": async (
      { tool, sessionID, callID, args },
      { output, metadata, title },
    ) => {
      if (tool.startsWith(FMARK_MCP_TOOL_PREFIX)) return;
      const sid = await resolveValidatedFmarkSessionId(ctx);
      if (!sid) return;
      const outputText = typeof output === "string" ? output : "";
      const metadataError =
        metadata !== null &&
        typeof metadata === "object" &&
        (metadata as Record<string, unknown>).error !== undefined &&
        (metadata as Record<string, unknown>).error !== null;
      const success = !metadataError && !/^Error:/i.test(outputText);
      await httpJson(ctx, "POST", `/sessions/${sid}/events/tool-use`, {
        participant_id: ctx.agentId,
        tool_name: tool,
        tool_use_id: callID,
        input: args,
        result: { output, metadata, title },
        success,
        path: ctx.projectPath,
      });
      turnHasContent.set(sessionID, true);
    },

    "permission.ask": async (permission, output) => {
      // Belt-and-suspenders for TUI mode where this hook may fire BEFORE the bus event.
      // We don't await the bus-event handler here; the SDK postSessionIdPermissionsPermissionId
      // call inside handlePermissionAsked will deliver the decision out-of-band. For this
      // synchronous hook we either match a known in-flight decision or leave "ask".
      const decision = await handlePermissionAsked(
        ctx,
        input.client,
        permission as unknown as Record<string, unknown>,
      );
      if (decision === "approve") output.status = "allow";
      else if (decision === "deny" || decision === "expired") output.status = "deny";
    },
  };
};

export default FmarkPlugin;
