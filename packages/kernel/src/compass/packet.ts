import type {
  AnyEventRecord,
  CompassPacket,
  CompassPacketEvent,
  ProsePayload,
  WakeReason,
} from "@f-mark/shared";
import { isPlaceholderSessionSlug } from "@f-mark/shared";
import { markFmarkWakePrompt } from "../launchPrompt.js";
import { latestEventTimestamp } from "./cursors.js";

const PACKET_EVENT_LIMIT = 8;
const SUMMARY_LIMIT = 240;

function truncate(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= SUMMARY_LIMIT) return normalized;
  return `${normalized.slice(0, SUMMARY_LIMIT - 3)}...`;
}

function isValidLines(value: unknown): value is [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [a, b] = value;
  return (
    typeof a === "number" &&
    typeof b === "number" &&
    Number.isInteger(a) &&
    Number.isInteger(b) &&
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    a > 0 &&
    b > 0 &&
    a <= b
  );
}

function isCommentProse(
  event: AnyEventRecord,
): event is AnyEventRecord & { payload: ProsePayload } {
  if (event.kind !== "prose") return false;
  const payload = event.payload as Partial<ProsePayload> | null | undefined;
  if (payload === null || payload === undefined) return false;
  if (payload.mode !== "comment") return false;
  if (typeof payload.append_to !== "string" || payload.append_to.length === 0) {
    return false;
  }
  return true;
}

function commentSummary(payload: ProsePayload): string {
  const anchor =
    typeof payload.append_to === "string" && payload.append_to.length > 0
      ? payload.append_to
      : "unknown";
  /* Only render the line range when `lines` is well-formed; otherwise
     drop it silently rather than emit `@NaN-Infinity` or `@-1-3`. */
  const where = isValidLines(payload.lines)
    ? `${anchor} @${payload.lines[0]}-${payload.lines[1]}`
    : anchor;
  const body = typeof payload.content === "string" ? payload.content.trim() : "";
  return truncate(body.length > 0 ? `comment on ${where}: ${body}` : `comment on ${where}`);
}

function payloadSummary(event: AnyEventRecord): string {
  if (isCommentProse(event)) {
    return commentSummary(event.payload);
  }
  const payload = event.payload;
  if (payload !== null && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.content === "string") return truncate(obj.content);
    if (typeof obj.title === "string") {
      const status =
        typeof obj.status === "string" ? ` [${obj.status}]` : "";
      return truncate(`${obj.title}${status}`);
    }
    if (typeof obj.question === "string") return truncate(obj.question);
    if (typeof obj.tool_name === "string") {
      return truncate(`tool-use ${obj.tool_name}`);
    }
    if (typeof obj.path === "string") return truncate(`file ${obj.path}`);
    if (typeof obj.id === "string") return truncate(`${event.kind} ${obj.id}`);
  }
  if (typeof payload === "string") return truncate(payload);
  return event.kind;
}

function packetEvent(event: AnyEventRecord): CompassPacketEvent {
  const base: CompassPacketEvent = {
    filename: event.filename,
    timestamp: event.timestamp,
    participant_id: event.participant_id,
    kind: event.kind,
    summary: payloadSummary(event),
  };
  /* Propagate comment-anchor metadata so agents can dereference the
     parent prose without a separate `fmark_get_inbox` call. Skip events
     that aren't prose, or prose without `append_to`. Guards reject
     malformed `lines` (NaN/Infinity/non-integer/reversed/non-positive)
     so a hand-edited or otherwise corrupt prose file can't emit
     `@NaN-Infinity` or be JSON-stringified to `[null, null]`. */
  if (event.kind === "prose") {
    const payload = event.payload as Partial<ProsePayload> | null | undefined;
    if (payload !== null && payload !== undefined) {
      if (
        typeof payload.append_to === "string" &&
        payload.append_to.length > 0
      ) {
        base.append_to = payload.append_to;
      }
      if (payload.mode === "content" || payload.mode === "comment") {
        base.mode = payload.mode;
      }
      if (isValidLines(payload.lines)) {
        base.lines = [payload.lines[0], payload.lines[1]];
      }
    }
  }
  return base;
}

export function buildCompassPacket(input: {
  sessionId: string;
  sessionSlug?: string;
  participantId: string;
  reason?: WakeReason;
  sourceEvent?: string;
  cursorBefore: string | null;
  events: AnyEventRecord[];
  limit?: number;
}): CompassPacket {
  const limit = input.limit ?? PACKET_EVENT_LIMIT;
  const events =
    input.events.length > limit
      ? input.events.slice(input.events.length - limit)
      : input.events;
  return {
    type: "fmark.wake",
    session_id: input.sessionId,
    ...(input.sessionSlug !== undefined
      ? { session_slug: input.sessionSlug }
      : {}),
    participant_id: input.participantId,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.sourceEvent !== undefined ? { source_event: input.sourceEvent } : {}),
    cursor_before: input.cursorBefore,
    cursor_after: latestEventTimestamp(input.events),
    event_count: input.events.length,
    events: events.map(packetEvent),
  };
}

export function buildWakePrompt(packet: CompassPacket): string {
  const reason =
    packet.reason === undefined
      ? "session activity"
      : `${packet.reason.replace(/-/g, " ")} activity`;
  const renameNudge =
    packet.session_slug !== undefined &&
    isPlaceholderSessionSlug(packet.session_slug)
      ? [
          "",
          sessionRenameNudge(),
        ]
      : [];
  return markFmarkWakePrompt(
    [
      "# F-Mark wake packet",
      "",
      `You have new F-Mark ${reason}. Use MCP tools, especially \`fmark_get_inbox\`, to fetch the unread details before responding. Do not use REST or shell commands for F-Mark writes.`,
      ...renameNudge,
      "",
      "```json",
      JSON.stringify(packet, null, 2),
      "```",
    ].join("\n"),
  );
}

/** Shared placeholder-rename instruction, injected into the launch packet
 *  and into every wake packet until the session sheds its placeholder name. */
export function sessionRenameNudge(): string {
  return "This session still has its placeholder name (`new-session`). Once you know what it is about — usually from the first user request — rename it with the `fmark_rename_session` MCP tool using a short kebab-case slug (e.g. `fix-login-flow`). If no request has arrived yet, leave the placeholder; never invent a name.";
}
