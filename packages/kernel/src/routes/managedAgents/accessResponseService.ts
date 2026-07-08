import type {
  AccessRequestPayload,
  AccessRequestSuggestion,
  AccessResponsePayload,
  AgentStatusRow,
  ManagedAccessResponseRequest,
  ManagedAccessResponseResponse,
} from "@f-mark/shared";
import { readEvents } from "../../events/reader.js";
import { extractTerminalAccessPrompt } from "../../terminalAccess.js";
import type { InputQueue } from "../../tmux/inputQueue.js";
import type { TmuxManager } from "../../tmux/manager.js";
import { publishEventWrites } from "../../services/eventPublisher.js";
import { writeAccessResponseEvent } from "../../services/events.js";
import { sessionExists } from "../../sessions.js";
import type { Bus } from "../../ws/bus.js";
import {
  isAccessResponse,
  isOpenAccessRequest,
  responseOption,
  responseStatus,
  statusFromExpired,
  terminalPromptFingerprint,
} from "./accessEvents.js";
import type { ManagedAgentRootBinding } from "./types.js";

type ErrorBody = { error: string };
type RouteResult<T> = { status: number; body: T } | { status: number; body: ErrorBody };

interface ManagedAgentAccessResponseServiceDeps {
  tmux: TmuxManager;
  inputQueue: InputQueue;
  bus: Bus;
  buildStatusRow(
    participantId: string,
    binding?: ManagedAgentRootBinding | null,
  ): Promise<AgentStatusRow | null>;
  publishAgentUpdated(
    participantId: string,
    binding?: ManagedAgentRootBinding | null,
  ): Promise<void>;
}

export class ManagedAgentAccessResponseService {
  constructor(private readonly deps: ManagedAgentAccessResponseServiceDeps) {}

  async respond(input: {
    participantId: string;
    requestId: string;
    binding: ManagedAgentRootBinding;
    body: ManagedAccessResponseRequest;
  }): Promise<RouteResult<ManagedAccessResponseResponse>> {
    const p = input.binding.paths;
    if (!(await sessionExists(p, input.body.session_id))) {
      return {
        status: 404,
        body: { error: `session not found: ${input.body.session_id}` },
      };
    }
    const agent = await this.deps.buildStatusRow(
      input.participantId,
      input.binding,
    );
    if (agent === null) {
      return {
        status: 404,
        body: { error: `agent not found: ${input.participantId}` },
      };
    }
    const request = await this.findOpenAccessRequest({
      binding: input.binding,
      sessionId: input.body.session_id,
      participantId: input.participantId,
      requestId: input.requestId,
    });
    if (request === null) {
      return { status: 409, body: { error: "access request is not open" } };
    }

    if (request.response_channel === "hook") {
      return this.respondToHookRequest({ ...input, request });
    }

    if (request.response_channel === "terminal") {
      return this.respondToTerminalRequest({ ...input, request, agent });
    }

    return {
      status: 200,
      body: await this.writeManagedAccessResponse({
        binding: input.binding,
        sessionId: input.body.session_id,
        participantId: input.participantId,
        body: input.body,
        request,
        delivered: false,
        delivery: "none",
        status: statusFromExpired(),
        decision: "expired",
        error: "access request has no live response channel",
      }),
    };
  }

  private async respondToHookRequest(input: {
    participantId: string;
    binding: ManagedAgentRootBinding;
    body: ManagedAccessResponseRequest;
    request: AccessRequestPayload;
  }): Promise<RouteResult<ManagedAccessResponseResponse>> {
    const option = responseOption(input.request, input.body);
    if (option.decision !== input.body.decision) {
      return {
        status: 400,
        body: { error: "selected option decision does not match request decision" },
      };
    }
    return {
      status: 200,
      body: await this.writeManagedAccessResponse({
        binding: input.binding,
        sessionId: input.body.session_id,
        participantId: input.participantId,
        body: input.body,
        request: input.request,
        delivered: true,
        delivery: "hook",
        status: responseStatus(input.body.decision),
        decision: option.decision,
        optionId: option.optionId,
        scope: option.scope,
      }),
    };
  }

  private async respondToTerminalRequest(input: {
    participantId: string;
    binding: ManagedAgentRootBinding;
    body: ManagedAccessResponseRequest;
    request: AccessRequestPayload;
    agent: AgentStatusRow;
  }): Promise<RouteResult<ManagedAccessResponseResponse>> {
    if (
      !(await this.terminalPromptStillLive(
        input.participantId,
        input.agent.tmux_session,
        input.request,
      ))
    ) {
      /* The pane that raised this native prompt is gone, was replaced (tmux
         session names are deterministic, so a relaunch reuses the name), or
         is simply no longer showing this prompt. Delivering now would type
         the decision into the wrong context — or, if the pane is gone, 409
         forever. Retire the request as expired instead. Mirrors the
         send-failure path below. */
      return {
        status: 200,
        body: await this.writeManagedAccessResponse({
          binding: input.binding,
          sessionId: input.body.session_id,
          participantId: input.participantId,
          body: input.body,
          request: input.request,
          delivered: false,
          delivery: "terminal",
          status: "expired",
          decision: "expired",
          error: "agent terminal is not connected",
        }),
      };
    }
    const option = responseOption(input.request, input.body);
    if (option.decision !== input.body.decision) {
      return {
        status: 400,
        body: { error: "selected option decision does not match request decision" },
      };
    }
    if (option.terminalInput === undefined) {
      return { status: 400, body: { error: "selected option has no terminal input" } };
    }

    /* terminalPromptStillLive confirmed a live pane above (it returns false for
       a null session), so this pointer is safe to deliver into. */
    const tmuxSession = input.agent.tmux_session as string;
    const terminalInput = option.terminalInput;
    try {
      await this.deps.inputQueue.enqueue(tmuxSession, async () => {
        await this.deps.tmux.sendLiteralText(tmuxSession, terminalInput);
        await this.deps.tmux.sendKey(tmuxSession, "C-m");
      });
    } catch (err) {
      return {
        status: 200,
        body: await this.writeManagedAccessResponse({
          binding: input.binding,
          sessionId: input.body.session_id,
          participantId: input.participantId,
          body: input.body,
          request: input.request,
          delivered: false,
          delivery: "terminal",
          status: "expired",
          decision: "expired",
          optionId: option.optionId,
          terminalInput: option.terminalInput,
          scope: option.scope,
          error: err instanceof Error ? err.message : String(err),
        }),
      };
    }

    return {
      status: 200,
      body: await this.writeManagedAccessResponse({
        binding: input.binding,
        sessionId: input.body.session_id,
        participantId: input.participantId,
        body: input.body,
        request: input.request,
        delivered: true,
        delivery: "terminal",
        status: responseStatus(option.decision),
        decision: option.decision,
        optionId: option.optionId,
        terminalInput: option.terminalInput,
        scope: option.scope,
      }),
    };
  }

  /* Re-verify, at respond time, that the pane is STILL displaying the exact
     prompt this request was captured from — by re-capturing and recomputing
     the same fingerprint used when the request was published. `tmux_session`
     alone is not enough: it can be non-null yet point at a replaced/relaunched
     pane (session names are deterministic) or a pane that has moved past the
     prompt. Only a live fingerprint match is safe to deliver into.

     The fingerprint is CONTENT identity (participant + session name + prompt
     text/command/suggestions), not pane-INSTANCE identity — intentionally. For
     an approval that is the right boundary: if the identical action is being
     prompted on this pane right now, typing the decision answers it correctly;
     a different or absent prompt, or a differently-named pane, expires. */
  private async terminalPromptStillLive(
    participantId: string,
    tmuxSession: string | null,
    request: AccessRequestPayload,
  ): Promise<boolean> {
    if (tmuxSession === null) return false;
    const expected = terminalFingerprintOf(request);
    if (expected === undefined) return false;
    let snapshot: string;
    try {
      snapshot = await this.deps.tmux.captureSnapshot(tmuxSession);
    } catch {
      return false;
    }
    const prompt = extractTerminalAccessPrompt(snapshot);
    if (prompt === null) return false;
    const current = terminalPromptFingerprint({
      participantId,
      tmuxSession,
      message: prompt.message,
      command: prompt.command,
      suggestions: prompt.suggestions,
    });
    return current === expected;
  }

  private async findOpenAccessRequest(input: {
    binding: ManagedAgentRootBinding;
    sessionId: string;
    participantId: string;
    requestId: string;
  }): Promise<AccessRequestPayload | null> {
    const events = await readEvents(input.binding.paths, input.sessionId, {
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

  private async writeManagedAccessResponse(input: {
    binding: ManagedAgentRootBinding;
    sessionId: string;
    participantId: string;
    body: ManagedAccessResponseRequest;
    request: AccessRequestPayload;
    delivered: boolean;
    delivery: AccessResponsePayload["delivery"];
    status: AccessResponsePayload["status"];
    decision: AccessResponsePayload["decision"];
    optionId?: string;
    terminalInput?: string;
    scope?: AccessRequestSuggestion["scope"];
    error?: string;
  }): Promise<ManagedAccessResponseResponse> {
    const written = await writeAccessResponseEvent(
      input.binding.paths,
      input.sessionId,
      {
        participant_id: input.body.participant_id,
        schema: "fmark.access-response.v1",
        request_id: input.request.request_id,
        decision: input.decision,
        status: input.status,
        delivered: input.delivered,
        delivery: input.delivery,
        ...(input.optionId !== undefined ? { option_id: input.optionId } : {}),
        ...(input.terminalInput !== undefined
          ? { terminal_input: input.terminalInput }
          : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.body.message !== undefined ? { message: input.body.message } : {}),
        ...(input.error !== undefined ? { error: input.error } : {}),
        responded_at: new Date().toISOString(),
      },
    );
    publishEventWrites(
      this.deps.bus,
      input.sessionId,
      written.publish,
      input.binding.pathId !== undefined
        ? {
            pathId: input.binding.pathId,
            ...(input.binding.revision !== undefined
              ? { revision: input.binding.revision }
              : {}),
          }
        : undefined,
    );
    await input.binding.state.updateControlState(input.participantId, {
      activity_state: "idle",
      last_activity_at: new Date().toISOString(),
    });
    await this.deps.publishAgentUpdated(input.participantId, input.binding);
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
}

/* The pane fingerprint stashed on the request at capture time
   (terminalAccessService), used to confirm the same prompt is still on
   screen before delivering a terminal decision. */
function terminalFingerprintOf(request: AccessRequestPayload): string | undefined {
  const raw = request.raw;
  if (raw === null || typeof raw !== "object") return undefined;
  const fingerprint = (raw as { terminal_fingerprint?: unknown })
    .terminal_fingerprint;
  return typeof fingerprint === "string" ? fingerprint : undefined;
}
