import type { ManagedAgentRootBinding } from "../types.js";
import type { ResumeRuntimePlan } from "./runtimePlan.js";
import type { ResumePaneDeps } from "./types.js";

export async function spawnResumedPane(input: {
  deps: ResumePaneDeps;
  participantId: string;
  sessionId: string;
  binding: ManagedAgentRootBinding;
  plan: ResumeRuntimePlan;
}): Promise<string> {
  await input.deps.ensureLaunchProjectConnection(input.binding.paths);
  const userParticipantId = await input.deps.firstUserParticipantId(
    input.binding.paths,
  );
  const { sessionName } = await input.deps.tmux.spawnAgent({
    participantId: input.participantId,
    executable: input.plan.runtime.executable,
    args: input.plan.resumeArgs.args,
    projectRoot: input.binding.paths.root(),
    env: {
      ...(input.plan.runtime.env ?? {}),
      F_MARK_RUNTIME_ID: input.plan.runtimeId,
      F_MARK_PATH: input.binding.paths.root(),
      F_MARK_SESSION_ID: input.sessionId,
      ...(userParticipantId !== undefined
        ? { F_MARK_USER_ID: userParticipantId }
        : {}),
    },
  });
  await persistResumedPane({
    ...input,
    sessionName,
  });
  return sessionName;
}

async function persistResumedPane(input: {
  deps: ResumePaneDeps;
  participantId: string;
  sessionId: string;
  binding: ManagedAgentRootBinding;
  plan: ResumeRuntimePlan;
  sessionName: string;
}): Promise<void> {
  await input.binding.state.writeTmuxSession(
    input.participantId,
    input.sessionName,
  );
  await input.binding.state.writeRuntime(input.participantId, input.plan.runtimeId);
  await input.binding.state.mergeRuntimeSession(input.participantId, {
    desired_name: input.sessionId,
    native_name_applied: input.plan.resumeArgs.nativeNameApplied,
    ...(typeof input.plan.runtimeSession?.native_session_id === "string" ||
    input.plan.runtimeId === "codex"
      ? { native_session_id: input.plan.resumeArgs.nativeSessionId }
      : {}),
    ...(input.plan.resumeArgs.recoveredTranscriptPath !== undefined
      ? { native_transcript_path: input.plan.resumeArgs.recoveredTranscriptPath }
      : {}),
    ...(input.plan.resumeArgs.nativeIdSource !== undefined
      ? { native_id_source: input.plan.resumeArgs.nativeIdSource }
      : {}),
  });
  await input.binding.state.updateControlState(input.participantId, {
    activity_state: "idle",
    last_activity_at: new Date().toISOString(),
    idle_stopped_at: null,
    idle_stop_reason: null,
    last_tmux_session: input.sessionName,
    pane_lifecycle: "live",
  });
  input.deps.tracker.setManagedPane(input.participantId, {
    paneAlive: () => input.deps.paneAlive(input.sessionName),
  });
  await input.binding.state.appendLog(input.participantId, {
    event: "provider-resume",
    runtime: input.plan.runtimeId,
    tmux_session: input.sessionName,
    active_session: input.sessionId,
    native_command: input.plan.resumeArgs.nativeCommand,
    native_session_id: input.plan.resumeArgs.nativeSessionId,
  });
  input.deps.scheduleTerminalAccessPolling({
    participantId: input.participantId,
    runtimeId: input.plan.runtimeId,
    binding: input.binding,
  });
  input.deps.scheduleCodexLiveTextPolling({
    participantId: input.participantId,
    sessionId: input.sessionId,
    runtimeId: input.plan.runtimeId,
    binding: input.binding,
    reset: input.plan.runtimeId === "codex",
  });
  await input.deps.publishAgentUpdated(input.participantId, input.binding);
}
