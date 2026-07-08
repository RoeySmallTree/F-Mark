import { paths as makePaths } from "../../paths.js";
import { isValidParticipantId } from "../../participants.js";
import { sessionExists } from "../../sessions.js";
import { createHookAgentStateStore } from "../../services/agentState.js";
import type { HookContext } from "../bootstrap.js";
import type { AutoStreamKind, HookPayload } from "./types.js";

export class HookParticipantResolver {
  async resolveParticipantId(input: {
    explicitParticipantId: string | null;
    kind: AutoStreamKind;
    payload: HookPayload;
    ctx: HookContext;
    env: NodeJS.ProcessEnv;
  }): Promise<string | null> {
    if (input.kind === "assistant") {
      return this.usableEnvParticipant(
        input.env.F_MARK_AGENT_ID,
        "F_MARK_AGENT_ID",
        true,
      );
    }
    if (input.explicitParticipantId === null) {
      return (
        this.usableEnvParticipant(input.env.F_MARK_USER_ID, "F_MARK_USER_ID", false) ??
        this.usableEnvParticipant(input.env.F_MARK_AGENT_ID, "F_MARK_AGENT_ID", true)
      );
    }
    if (isValidParticipantId(input.explicitParticipantId)) {
      return input.explicitParticipantId;
    }
    process.stderr.write(
      `f-mark auto-stream: invalid participant id: ${input.explicitParticipantId}\n`,
    );
    return null;
  }

  async resolveSessionId(input: {
    ctx: HookContext;
    participantId: string;
    payload: HookPayload;
    env: NodeJS.ProcessEnv;
    allowLinkedActiveSession: boolean;
  }): Promise<string | null> {
    const agentState = createHookAgentStateStore({
      projectRoot: input.ctx.path,
      fmarkDir: input.ctx.fmarkDir,
      env: input.env,
    });
    const p = makePaths(input.ctx.path);

    for (const candidate of this.sessionCandidates(input)) {
      if (await sessionExists(p, candidate)) {
        await agentState.writeActiveSession(input.participantId, candidate);
        return candidate;
      }
    }

    if (input.allowLinkedActiveSession) {
      const existing = await agentState.readActiveSession(input.participantId);
      if (existing && (await sessionExists(p, existing))) return existing;
    }

    return null;
  }

  async hasActiveSessionPointer(input: {
    ctx: HookContext;
    participantId: string;
    env: NodeJS.ProcessEnv;
  }): Promise<boolean> {
    const agentState = createHookAgentStateStore({
      projectRoot: input.ctx.path,
      fmarkDir: input.ctx.fmarkDir,
      env: input.env,
    });
    return (await agentState.readActiveSession(input.participantId)) !== null;
  }

  private usableEnvParticipant(
    value: string | undefined,
    name: "F_MARK_AGENT_ID" | "F_MARK_USER_ID",
    warnOnMissing: boolean,
  ): string | null {
    if (typeof value !== "string" || value.length === 0) {
      if (warnOnMissing) {
        process.stderr.write(
          `f-mark auto-stream: ${name} is not set; unmanaged hook ignored\n`,
        );
      }
      return null;
    }
    if (!isValidParticipantId(value)) {
      process.stderr.write(`f-mark auto-stream: invalid ${name}: ${value}\n`);
      return null;
    }
    return value;
  }

  private sessionCandidates(input: {
    payload: HookPayload;
    env: NodeJS.ProcessEnv;
  }): string[] {
    const payloadSessionIdRaw = (input.payload as { fmark_session_id?: unknown })
      .fmark_session_id;
    const payloadSessionId =
      typeof payloadSessionIdRaw === "string" ? payloadSessionIdRaw : null;
    return [input.env.F_MARK_SESSION_ID, payloadSessionId].filter(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.length > 0,
    );
  }
}
