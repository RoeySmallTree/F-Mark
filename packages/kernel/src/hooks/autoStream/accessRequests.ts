import type {
  AccessRequestSuggestion,
  AccessResponseDecision,
  AccessResponsePayload,
} from "@f-mark/shared";
import { paths as makePaths } from "../../paths.js";
import { readEvents } from "../../events/reader.js";
import type { HookContext } from "../bootstrap.js";
import {
  postAccessRequest,
  postAccessResponse,
} from "../post.js";
import type { AccessRequestPayload, HookPayload } from "./types.js";
import { stringField } from "./fields.js";
import * as logger from "../../logger.js";

/* Mirrors the renderer's suggestion filter (composeHelpers.ts /
   AccessRequestCard.tsx: accessRequestSuggestions / requestSuggestions) so
   this warning fires exactly when the renderer would silently drop an
   entry. */
function isPermissionSuggestion(value: unknown): value is AccessRequestSuggestion {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    (candidate.decision === "approve" || candidate.decision === "deny")
  );
}

const ACCESS_REQUEST_MESSAGE_KEYS = [
  "content",
  "text",
  "title",
  "prompt",
  "body",
  "html",
  "message",
  "question",
  "path",
  "filename",
  "name",
  "tool_name",
] as const;

const ACCESS_REQUEST_JSON_PREVIEW_LIMIT = 800;

export class AccessRequestExtractor {
  extract(input: {
    payload: HookPayload;
    participantId: string;
    runtimeId: string | null;
  }): AccessRequestPayload | null {
    const payload = input.payload as Record<string, unknown>;
    if (stringField(payload, "hook_event_name") !== "PermissionRequest") {
      return null;
    }
    return this.permissionRequest(payload, input.runtimeId);
  }

  private permissionRequest(
    payload: Record<string, unknown>,
    runtimeId: string | null,
  ): AccessRequestPayload {
    const toolInput = payload.tool_input;
    const command = stringField(toolInput, "command");
    const description = stringField(toolInput, "description");
    const toolName = stringField(payload, "tool_name");
    return {
      schema: "fmark.access-request.v1",
      request_id: `ar-${crypto.randomUUID()}`,
      status: "open",
      request_type: command !== undefined ? "command" : "tool",
      runtime_id: runtimeId ?? "claude",
      runtime_session_id: stringField(payload, "session_id"),
      runtime_turn_id: stringField(payload, "turn_id"),
      hook_event_name: "PermissionRequest",
      title: toolName ?? "Permission request",
      message: this.pickMessage(toolInput, command ?? description),
      ...this.optionalPayloadFields(payload, toolInput, toolName, command),
      response_channel: "hook",
      raw: payload,
      created_at: new Date().toISOString(),
    };
  }

  private optionalPayloadFields(
    payload: Record<string, unknown>,
    toolInput: unknown,
    toolName: string | undefined,
    command: string | undefined,
  ): Partial<AccessRequestPayload> {
    return {
      ...(toolName !== undefined ? { tool_name: toolName } : {}),
      ...(toolInput !== undefined ? { tool_input: toolInput } : {}),
      ...(command !== undefined ? { command } : {}),
      ...this.optionalString(payload, "permission_mode"),
      ...this.optionalString(payload, "cwd"),
      ...this.optionalString(payload, "transcript_path"),
      ...this.suggestionsField(payload),
    };
  }

  private suggestionsField(
    payload: Record<string, unknown>,
  ): Partial<AccessRequestPayload> {
    if (!Array.isArray(payload.permission_suggestions)) return {};
    const received = payload.permission_suggestions;
    const suggestions = received.filter(isPermissionSuggestion);
    if (suggestions.length !== received.length) {
      logger.warn(
        `dropped malformed permission_suggestions: received=${received.length} accepted=${suggestions.length}`,
      );
    }
    return { suggestions };
  }

  private optionalString(
    payload: Record<string, unknown>,
    key: "permission_mode" | "cwd" | "transcript_path",
  ): Partial<AccessRequestPayload> {
    const value = stringField(payload, key);
    return value === undefined ? {} : { [key]: value };
  }

  private pickMessage(
    toolInput: unknown,
    preferred: string | undefined,
  ): string | undefined {
    return (
      preferred ??
      this.pickWellKnownMessageField(toolInput) ??
      this.jsonPreview(toolInput)
    );
  }

  private pickWellKnownMessageField(toolInput: unknown): string | undefined {
    if (toolInput === null || typeof toolInput !== "object") return undefined;
    for (const key of ACCESS_REQUEST_MESSAGE_KEYS) {
      const value = stringField(toolInput, key);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  private jsonPreview(toolInput: unknown): string | undefined {
    if (toolInput === null || typeof toolInput !== "object") return undefined;
    try {
      const json = JSON.stringify(toolInput);
      if (typeof json !== "string" || json.length === 0) return undefined;
      return json.length <= ACCESS_REQUEST_JSON_PREVIEW_LIMIT
        ? json
        : `${json.slice(0, ACCESS_REQUEST_JSON_PREVIEW_LIMIT - 1)}…`;
    } catch {
      return undefined;
    }
  }
}

export class AccessRequestBridge {
  async handle(input: {
    ctx: HookContext;
    participantId: string;
    sessionId: string;
    request: AccessRequestPayload;
    env: NodeJS.ProcessEnv;
  }): Promise<void> {
    await postAccessRequest(input.ctx, input.sessionId, {
      participant_id: input.participantId,
      ...input.request,
    });
    if (input.request.response_channel !== "hook") return;
    await this.awaitHookResponse(input);
  }

  private async awaitHookResponse(input: {
    ctx: HookContext;
    participantId: string;
    sessionId: string;
    request: AccessRequestPayload;
    env: NodeJS.ProcessEnv;
  }): Promise<void> {
    const deadline = Date.now() + this.timeoutMs(input.env);
    while (Date.now() < deadline) {
      const response = await this.findResponse({
        projectRoot: input.ctx.path,
        sessionId: input.sessionId,
        requestId: input.request.request_id,
      });
      if (this.writeDecision(response, input.request)) return;
      await sleep(250);
    }
    await this.postTimeout(input);
  }

  private timeoutMs(env: NodeJS.ProcessEnv): number {
    const timeoutRaw = env.F_MARK_ACCESS_REQUEST_TIMEOUT_MS;
    return typeof timeoutRaw === "string" && Number.isFinite(Number(timeoutRaw))
      ? Math.max(1, Number(timeoutRaw))
      : 300_000;
  }

  private async findResponse(input: {
    projectRoot: string;
    sessionId: string;
    requestId: string;
  }): Promise<AccessResponsePayload | null> {
    const events = await readEvents(makePaths(input.projectRoot), input.sessionId, {
      kinds: ["access-response"],
    });
    return events
      .filter((event) => event.kind === "access-response")
      .map((event) => event.payload as AccessResponsePayload)
      .filter((payload) => payload.request_id === input.requestId)
      .sort((a, b) => a.responded_at.localeCompare(b.responded_at))
      .at(-1) ?? null;
  }

  private writeDecision(
    response: AccessResponsePayload | null,
    request: AccessRequestPayload,
  ): boolean {
    const decision = response === null ? null : accessResponseDecision(response);
    if (decision === null) return false;
    process.stdout.write(
      `${permissionHookOutput({
        runtimeId: request.runtime_id,
        decision,
        message: response?.message,
      })}\n`,
    );
    return true;
  }

  private async postTimeout(input: {
    ctx: HookContext;
    participantId: string;
    sessionId: string;
    request: AccessRequestPayload;
  }): Promise<void> {
    await postAccessResponse(input.ctx, input.sessionId, {
      participant_id: input.participantId,
      schema: "fmark.access-response.v1",
      request_id: input.request.request_id,
      decision: "bridge-timeout",
      status: "bridge-timeout",
      delivered: false,
      delivery: "hook",
      error:
        "F-Mark hook bridge timed out; the provider may still be waiting in the terminal",
      responded_at: new Date().toISOString(),
    });
  }
}

function accessResponseDecision(
  response: AccessResponsePayload,
): Extract<AccessResponseDecision, "approve" | "deny"> | null {
  return response.decision === "approve" || response.decision === "deny"
    ? response.decision
    : null;
}

function permissionHookOutput(input: {
  runtimeId: string | null;
  decision: Extract<AccessResponseDecision, "approve" | "deny">;
  message?: string;
}): string {
  const behavior = input.decision === "approve" ? "allow" : "deny";
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision:
        behavior === "allow"
          ? { behavior }
          : { behavior, message: input.message ?? "Denied by F-Mark" },
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
