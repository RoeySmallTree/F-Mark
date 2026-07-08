import { readLiveTmuxSession } from "./livePane.js";
import {
  ResumeLockRegistry,
  resumeLockKeyFor,
} from "./resumeLockRegistry.js";
import { buildResumeRuntimePlan } from "./runtimePlan.js";
import { spawnResumedPane } from "./spawnResumedPane.js";
import type { ResumePaneDeps, ResumePaneInput, ResumeResult } from "./types.js";

export class ResumePaneCoordinator {
  constructor(
    private readonly deps: ResumePaneDeps,
    private readonly locks = new ResumeLockRegistry(),
  ) {}

  async resume(input: ResumePaneInput): Promise<ResumeResult> {
    const startedAt = Date.now();
    return this.locks.runExclusive(resumeLockKeyFor(input.binding, input.participantId), () =>
      this.resumeWithinLock(input, startedAt),
    );
  }

  private async resumeWithinLock(
    input: ResumePaneInput,
    startedAt: number,
  ): Promise<ResumeResult> {
    const liveTmuxSession = await readLiveTmuxSession({
      tmux: this.deps.tmux,
      binding: input.binding,
      participantId: input.participantId,
      liveTmuxSessions: input.liveTmuxSessions,
    });
    if (liveTmuxSession !== null) {
      return {
        ok: true,
        participant_id: input.participantId,
        tmux_session: liveTmuxSession,
        resumed: false,
      };
    }

    const control = await input.binding.state.readControlState(input.participantId);
    if (input.idleOnly === true && control.pane_lifecycle !== "idle-stopped") {
      return {
        ok: false,
        participant_id: input.participantId,
        reason: "not-idle-stopped",
        detail: `pane lifecycle is ${control.pane_lifecycle ?? "unknown"}`,
      };
    }

    const plan = await buildResumeRuntimePlan({
      participantId: input.participantId,
      sessionId: input.sessionId,
      binding: input.binding,
      accessMode: control.access_mode,
      env: this.deps.integrationEnv,
    });
    if (!plan.ok) {
      return plan;
    }

    const sessionName = await spawnResumedPane({
      deps: this.deps,
      participantId: input.participantId,
      sessionId: input.sessionId,
      binding: input.binding,
      plan,
    });
    return {
      ok: true,
      participant_id: input.participantId,
      tmux_session: sessionName,
      resumed: true,
    };
  }
}
