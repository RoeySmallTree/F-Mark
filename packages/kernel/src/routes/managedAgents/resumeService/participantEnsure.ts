import type { EnsureManagedAgentsResponse } from "@f-mark/shared";
import { isValidParticipantId } from "../../../participants.js";
import type { ManagedAgentRootBinding } from "../types.js";
import type {
  EnsureParticipantResult,
  ResumePaneInput,
  ResumeResult,
} from "./types.js";

export async function ensureParticipant(input: {
  participantId: string;
  managed: Set<string>;
  sessionId: string;
  binding: ManagedAgentRootBinding;
  includeNotActiveSkips: boolean;
  idleOnly?: boolean;
  liveTmuxSessions?: ReadonlySet<string>;
  resumePane(input: ResumePaneInput): Promise<ResumeResult>;
}): Promise<EnsureParticipantResult> {
  if (!isValidParticipantId(input.participantId)) {
    return {
      kind: "skip",
      entry: {
        participant_id: input.participantId,
        reason: "invalid-target",
      },
    };
  }
  if (!input.managed.has(input.participantId)) {
    return {
      kind: "skip",
      entry: {
        participant_id: input.participantId,
        reason: "not-managed",
      },
    };
  }

  const activeSession = await input.binding.state.readActiveSession(
    input.participantId,
  );
  if (activeSession !== input.sessionId) {
    if (!input.includeNotActiveSkips) return { kind: "ignore" };
    return {
      kind: "skip",
      entry: {
        participant_id: input.participantId,
        reason: "not-active",
        detail: activeSession ?? "no active session",
      },
    };
  }

  const control = await input.binding.state.readControlState(input.participantId);
  if (control.paused) {
    return {
      kind: "skip",
      entry: { participant_id: input.participantId, reason: "paused" },
    };
  }

  const resume = await input.resumePane({
    participantId: input.participantId,
    sessionId: input.sessionId,
    binding: input.binding,
    idleOnly: input.idleOnly,
    liveTmuxSessions: input.liveTmuxSessions,
  });
  if (!resume.ok) {
    return {
      kind: "skip",
      entry: skippedFromResume(resume),
    };
  }

  return {
    kind: "ready",
    resume,
    entry: {
      participant_id: resume.participant_id,
      tmux_session: resume.tmux_session,
    },
  };
}

function skippedFromResume(
  resume: Extract<ResumeResult, { ok: false }>,
): EnsureManagedAgentsResponse["skipped"][number] {
  return {
    participant_id: resume.participant_id,
    reason: resume.reason,
    ...(resume.detail !== undefined ? { detail: resume.detail } : {}),
  };
}
