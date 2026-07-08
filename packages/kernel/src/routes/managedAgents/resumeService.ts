import type { EnsureManagedAgentsResponse } from "@f-mark/shared";
import { ensureParticipant } from "./resumeService/participantEnsure.js";
import { ResumeLockRegistry } from "./resumeService/resumeLockRegistry.js";
import { ResumePaneCoordinator } from "./resumeService/resumePaneCoordinator.js";
import type {
  EnsureParticipantResult,
  ResumePaneDeps,
  ResumePaneInput,
  ResumeResult,
} from "./resumeService/types.js";
import type { ManagedAgentRootBinding } from "./types.js";

interface ManagedAgentResumeServiceDeps extends ResumePaneDeps {}

export class ManagedAgentResumeService {
  private readonly resumeLocks = new ResumeLockRegistry();
  private readonly paneCoordinator: ResumePaneCoordinator;

  constructor(private readonly deps: ManagedAgentResumeServiceDeps) {
    this.paneCoordinator = new ResumePaneCoordinator(deps, this.resumeLocks);
  }

  async ensureForSession(input: {
    sessionId: string;
    binding: ManagedAgentRootBinding;
    targetParticipantIds?: string[];
    includeNotActiveSkips: boolean;
    idleOnly?: boolean;
  }): Promise<EnsureManagedAgentsResponse> {
    const managedIds = await input.binding.state.listManagedAgentIds();
    const managed = new Set(managedIds);
    const targetIds =
      input.targetParticipantIds !== undefined
        ? [...new Set(input.targetParticipantIds)]
        : managedIds;
    const resumed: EnsureManagedAgentsResponse["resumed"] = [];
    const alreadyLive: EnsureManagedAgentsResponse["already_live"] = [];
    const skipped: EnsureManagedAgentsResponse["skipped"] = [];
    const liveTmuxSessions = new Set(
      (
        await this.deps.tmux.listFmarkSessions(
          input.binding.tmuxRoot ?? undefined,
        )
      ).map((session) => session.sessionName),
    );

    for (const participantId of targetIds) {
      const result = await this.ensureParticipant({
        participantId,
        managed,
        input,
        liveTmuxSessions,
      });
      if (result.kind === "ignore") continue;
      if (result.kind === "skip") {
        skipped.push(result.entry);
        continue;
      }
      if (result.resume.resumed) {
        resumed.push(result.entry);
      } else {
        alreadyLive.push(result.entry);
      }
    }

    return {
      session_id: input.sessionId,
      resumed,
      already_live: alreadyLive,
      skipped,
    };
  }

  private async ensureParticipant(input: {
    participantId: string;
    managed: Set<string>;
    liveTmuxSessions: ReadonlySet<string>;
    input: {
      sessionId: string;
      binding: ManagedAgentRootBinding;
      includeNotActiveSkips: boolean;
      idleOnly?: boolean;
    };
  }): Promise<EnsureParticipantResult> {
    const ensureInput = input.input;
    return ensureParticipant({
      participantId: input.participantId,
      managed: input.managed,
      sessionId: ensureInput.sessionId,
      binding: ensureInput.binding,
      includeNotActiveSkips: ensureInput.includeNotActiveSkips,
      idleOnly: ensureInput.idleOnly,
      liveTmuxSessions: input.liveTmuxSessions,
      resumePane: (resumeInput) => this.resumePane(resumeInput),
    });
  }

  private resumePane(input: ResumePaneInput): Promise<ResumeResult> {
    return this.paneCoordinator.resume(input);
  }
}
