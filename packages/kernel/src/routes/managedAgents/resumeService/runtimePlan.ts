import type { RuntimeEntry, RuntimeSessionInfo } from "@f-mark/shared";
import { listParticipants } from "../../../participants.js";
import { loadRuntimeRegistry } from "../../../runtimes/store.js";
import { normalizeAccessMode } from "../runtimeAccess.js";
import { buildResumeArgs } from "../runtimeArgs.js";
import type { ManagedAgentRootBinding } from "../types.js";
import { runtimeOverrideForParticipant } from "./runtimeOverride.js";
import type { ResumeResult } from "./types.js";

export interface ResumeArgsPlan {
  args: string[];
  nativeNameApplied: boolean;
  nativeSessionId: string;
  nativeCommand: string;
  recoveredTranscriptPath?: string;
  nativeIdSource?: RuntimeSessionInfo["native_id_source"];
}

export interface ResumeRuntimePlan {
  ok: true;
  runtimeId: string;
  runtime: RuntimeEntry;
  runtimeSession: RuntimeSessionInfo | null;
  resumeArgs: ResumeArgsPlan;
}

export async function buildResumeRuntimePlan(input: {
  participantId: string;
  sessionId: string;
  binding: ManagedAgentRootBinding;
  accessMode: string;
  env: NodeJS.ProcessEnv;
}): Promise<ResumeRuntimePlan | Extract<ResumeResult, { ok: false }>> {
  const participants = await listParticipants(input.binding.paths, {
    agentState: input.binding.state,
  });
  const participant = participants[input.participantId];
  const runtimeId =
    participant?.runtime_id ??
    (await input.binding.state.readRuntime(input.participantId));
  if (runtimeId === null || runtimeId === undefined) {
    return resumeFailure({
      participantId: input.participantId,
      reason: "runtime-missing",
      detail: "agent has no runtime_id",
    });
  }

  const runtimes = await loadRuntimeRegistry({ fallback: input.binding.paths });
  const runtime = runtimes.runtimes[runtimeId];
  if (runtime === undefined) {
    return resumeFailure({
      participantId: input.participantId,
      reason: "runtime-unknown",
      detail: `unknown runtime_id: ${runtimeId}`,
    });
  }

  const runtimeSession = await input.binding.state.readRuntimeSession(
    input.participantId,
  );
  const resumeArgs = await buildResumeArgs({
    runtimeId,
    runtime,
    runtimeSession,
    activeSession: input.sessionId,
    participantId: input.participantId,
    projectRoot: input.binding.paths.root(),
    override: runtimeOverrideForParticipant(participant),
    accessMode: normalizeAccessMode(runtimeId, input.accessMode),
    env: input.env,
  });
  if (!resumeArgs.ok) {
    return resumeFailure({
      participantId: input.participantId,
      reason: resumeArgs.reason,
      detail: resumeArgs.detail,
    });
  }

  return {
    ok: true,
    runtimeId,
    runtime,
    runtimeSession,
    resumeArgs,
  };
}

function resumeFailure(input: {
  participantId: string;
  reason: Extract<ResumeResult, { ok: false }>["reason"];
  detail: string;
}): Extract<ResumeResult, { ok: false }> {
  return {
    ok: false,
    participant_id: input.participantId,
    reason: input.reason,
    detail: input.detail,
  };
}
