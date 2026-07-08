import { createHash } from "node:crypto";
import type {
  AccessRequestPayload,
  AccessRequestSuggestion,
  AccessResponsePayload,
  ManagedAccessResponseRequest,
} from "@f-mark/shared";
import { readEvents } from "../../events/reader.js";
import type { Paths } from "../../paths.js";
import { listSessions } from "../../sessions.js";

export function responseStatus(
  decision: ManagedAccessResponseRequest["decision"],
): AccessResponsePayload["status"] {
  return decision === "approve" ? "approved" : "denied";
}

export function statusFromExpired(): AccessResponsePayload["status"] {
  return "expired";
}

export function responseOption(
  request: AccessRequestPayload,
  body: ManagedAccessResponseRequest,
): {
  decision: Extract<AccessResponsePayload["decision"], "approve" | "deny">;
  optionId?: string;
  terminalInput?: string;
  scope?: AccessRequestSuggestion["scope"];
} {
  const suggestions = Array.isArray(request.suggestions)
    ? request.suggestions
    : [];
  const selected =
    body.option_id !== undefined
      ? suggestions.find((suggestion) => suggestion.id === body.option_id)
      : suggestions.find((suggestion) => suggestion.decision === body.decision);

  if (selected === undefined) {
    return { decision: body.decision };
  }
  return {
    decision: selected.decision,
    optionId: selected.id,
    terminalInput: selected.terminal_input,
    scope: selected.scope,
  };
}

export function isOpenAccessRequest(event: unknown): event is {
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

export function isAccessResponse(event: unknown): event is {
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

export async function pendingAccessCounts(input: {
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

export function terminalPromptFingerprint(input: {
  participantId: string;
  tmuxSession: string;
  message: string;
  command?: string;
  suggestions: unknown[];
}): string {
  return createHash("sha1")
    .update(input.participantId)
    .update("\0")
    .update(input.tmuxSession)
    .update("\0")
    .update(input.message)
    .update("\0")
    .update(input.command ?? "")
    .update("\0")
    .update(JSON.stringify(input.suggestions))
    .digest("hex")
    .slice(0, 20);
}
