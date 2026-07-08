import type { AccessRequestPayload } from "@f-mark/shared";
import { readEvents } from "../../events/reader.js";
import { publishEventWrites } from "../../services/eventPublisher.js";
import { writeAccessRequestEvent } from "../../services/events.js";
import { sessionExists } from "../../sessions.js";
import { extractTerminalAccessPrompt } from "../../terminalAccess.js";
import type { TmuxManager } from "../../tmux/manager.js";
import type { Bus } from "../../ws/bus.js";
import {
  isAccessResponse,
  isOpenAccessRequest,
  terminalPromptFingerprint,
} from "./accessEvents.js";
import type { ManagedAgentRootBinding } from "./types.js";

const TERMINAL_PROMPT_SEEN_TTL_MS = 10 * 60 * 1000;

interface ManagedAgentTerminalAccessServiceDeps {
  tmux: TmuxManager;
  bus: Bus;
  bindingFor(
    binding?: ManagedAgentRootBinding | null,
  ): ManagedAgentRootBinding;
  publishAgentUpdated(
    participantId: string,
    binding?: ManagedAgentRootBinding | null,
  ): Promise<void>;
}

export class ManagedAgentTerminalAccessService {
  private readonly seen = new Map<string, number>();

  constructor(private readonly deps: ManagedAgentTerminalAccessServiceDeps) {}

  async publish(input: {
    participantId: string;
    runtimeId: string | null;
    tmuxSession: string;
    binding?: ManagedAgentRootBinding | null;
  }): Promise<boolean> {
    const bound = this.deps.bindingFor(input.binding);
    const p = bound.paths;
    const state = bound.state;
    const sessionId = await state.readActiveSession(input.participantId);
    if (sessionId === null || sessionId.length === 0) return false;
    if (!(await sessionExists(p, sessionId))) return false;

    const snapshot = await this.deps.tmux.captureSnapshot(input.tmuxSession);
    const prompt = extractTerminalAccessPrompt(snapshot);
    if (prompt === null) return false;
    const fingerprint = terminalPromptFingerprint({
      participantId: input.participantId,
      tmuxSession: input.tmuxSession,
      message: prompt.message,
      command: prompt.command,
      suggestions: prompt.suggestions,
    });
    if (this.seen.has(fingerprint)) return false;
    if (
      await this.alreadyOpen({
        binding: bound,
        sessionId,
        participantId: input.participantId,
        fingerprint,
      })
    ) {
      this.markSeen(fingerprint);
      return true;
    }

    const request: AccessRequestPayload = {
      schema: "fmark.access-request.v1",
      request_id: `ar-terminal-${fingerprint}`,
      status: "open",
      request_type: prompt.request_type,
      runtime_id: input.runtimeId,
      runtime_session_id: input.tmuxSession,
      hook_event_name: "TerminalPermissionPrompt",
      title: prompt.title,
      message: prompt.message,
      ...(prompt.command !== undefined ? { tool_name: "Bash" } : {}),
      ...(prompt.command !== undefined
        ? {
            tool_input: {
              command: prompt.command,
              ...(prompt.description !== undefined
                ? { description: prompt.description }
                : {}),
            },
          }
        : {}),
      ...(prompt.command !== undefined ? { command: prompt.command } : {}),
      suggestions: prompt.suggestions,
      response_channel: "terminal",
      raw: {
        ...prompt.raw,
        terminal_fingerprint: fingerprint,
        tmux_session: input.tmuxSession,
      },
      created_at: new Date().toISOString(),
    };
    const written = await writeAccessRequestEvent(p, sessionId, {
      participant_id: input.participantId,
      ...request,
    });
    publishEventWrites(
      this.deps.bus,
      sessionId,
      written.publish,
      bound.pathId !== undefined
        ? {
            pathId: bound.pathId,
            ...(bound.revision !== undefined ? { revision: bound.revision } : {}),
          }
        : undefined,
    );
    this.markSeen(fingerprint);
    await state.updateControlState(input.participantId, {
      activity_state: "access-pending",
      last_activity_at: new Date().toISOString(),
    });
    await this.deps.publishAgentUpdated(input.participantId, input.binding);
    return true;
  }

  private async alreadyOpen(input: {
    binding: ManagedAgentRootBinding;
    sessionId: string;
    participantId: string;
    fingerprint: string;
  }): Promise<boolean> {
    const events = await readEvents(input.binding.paths, input.sessionId, {
      kinds: ["access-request", "access-response"],
    });
    const responses = new Set<string>();
    for (const event of events) {
      if (isAccessResponse(event)) responses.add(event.payload.request_id);
    }
    return events.some((event) => {
      if (!isOpenAccessRequest(event)) return false;
      if (event.participant_id !== input.participantId) return false;
      if (responses.has(event.payload.request_id)) return false;
      const raw = event.payload.raw;
      return (
        raw !== null &&
        typeof raw === "object" &&
        (raw as { terminal_fingerprint?: unknown }).terminal_fingerprint ===
          input.fingerprint
      );
    });
  }

  private markSeen(fingerprint: string): void {
    const now = Date.now();
    for (const [key, seenAt] of this.seen.entries()) {
      if (now - seenAt > TERMINAL_PROMPT_SEEN_TTL_MS) {
        this.seen.delete(key);
      }
    }
    this.seen.set(fingerprint, now);
  }
}
