import { join } from "node:path";
import type { Paths } from "../paths.js";
import type { TmuxManager } from "../tmux/manager.js";
import type { PresenceTracker } from "../presence/tracker.js";
import { checkHookInstallStatus } from "../hooksInstall/index.js";
import { listParticipants } from "../participants.js";
import {
  createAgentStateStoreForAgentsDir,
  type AgentStateStore,
} from "../services/agentState.js";

type FmarkTmuxSession = Awaited<
  ReturnType<TmuxManager["listFmarkSessions"]>
>[number];

export interface ReconcileDeps {
  paths: Paths;
  tmux: TmuxManager;
  tracker: PresenceTracker;
  /* Optional explicit agentsDir. When set, reconcile reads from this
     directory instead of `<paths.fmarkDir()>/agents`. Production passes
     `globalPaths.projectAgentsDir(pathId)` here for multi-path scoping;
     tests omit it to keep the legacy per-path behavior. */
  agentsDir?: string;
  agentState?: AgentStateStore;
}

export class StartupReconciler {
  private readonly paths: Paths;
  private readonly tmux: TmuxManager;
  private readonly tracker: PresenceTracker;
  private readonly agentState: AgentStateStore;

  constructor(deps: ReconcileDeps) {
    this.paths = deps.paths;
    this.tmux = deps.tmux;
    this.tracker = deps.tracker;
    const agentsDir = deps.agentsDir ?? join(this.paths.fmarkDir(), "agents");
    this.agentState =
      deps.agentState ?? createAgentStateStoreForAgentsDir(agentsDir);
  }

  async run(): Promise<void> {
    const version = await this.tmux.getVersion();
    if (!version) return;

    const sessions = await this.tmux.listFmarkSessions(this.paths.root());
    const liveAgentSessions = this.liveAgentSessionNames(sessions);
    const agentIds = await this.agentState.listManagedAgentIds();
    const userParticipantId = await this.findUserParticipantId();

    for (const agentId of agentIds) {
      await this.reconcileManagedAgent(
        agentId,
        liveAgentSessions,
        userParticipantId,
      );
    }

    await this.killOrphanAgentSessions(sessions, new Set(agentIds));
  }

  private liveAgentSessionNames(sessions: FmarkTmuxSession[]): Set<string> {
    const names = new Set<string>();
    for (const session of sessions) {
      if (session.kind === "agent" && session.participantId) {
        names.add(session.sessionName);
      }
    }
    return names;
  }

  private async findUserParticipantId(): Promise<string | undefined> {
    try {
      const participants = await listParticipants(this.paths);
      for (const [id, participant] of Object.entries(participants)) {
        if (participant.kind === "user") return id;
      }
    } catch {
      // Best effort. checkHookInstallStatus falls back to us-unknown.
    }
    return undefined;
  }

  private async reconcileManagedAgent(
    agentId: string,
    liveAgentSessions: Set<string>,
    userParticipantId: string | undefined,
  ): Promise<void> {
    const expectedSession = await this.agentState.readTmuxSession(agentId);
    if (expectedSession !== null && liveAgentSessions.has(expectedSession)) {
      await this.markSurvivingAgent(agentId, userParticipantId);
      return;
    }

    await this.markMissingPaneAgent(agentId, expectedSession);
  }

  private async markSurvivingAgent(
    agentId: string,
    userParticipantId: string | undefined,
  ): Promise<void> {
    this.tracker.setManagedPane(agentId, { paneAlive: () => true });

    const runtimeId = await this.agentState.readRuntime(agentId);
    if (runtimeId === null) return;

    try {
      const status = await checkHookInstallStatus({
        runtimeId,
        participantId: agentId,
        userParticipantId,
        projectRoot: this.paths.root(),
      });
      if (status.installed || status.expectedEntries.length === 0) {
        // Hooks are installed but we have no recent ping — surface as
        // "stale" until the next ping flips state back to "online".
        this.tracker.markReconciledStale(agentId, { paneAlive: () => true });
      } else {
        this.tracker.setManagedHookStatus(agentId, false);
      }
    } catch {
      // Unknown runtime: leave hook status unset.
    }
  }

  private async markMissingPaneAgent(
    agentId: string,
    expectedSession: string | null,
  ): Promise<void> {
    const runtimeId = await this.agentState.readRuntime(agentId);
    const activeSession = await this.agentState.readActiveSession(agentId);
    const runtimeSession = await this.agentState.readRuntimeSession(agentId);
    const control = await this.agentState.readControlState(agentId);

    if (this.hasNoResumeState(runtimeId, activeSession, runtimeSession)) {
      await this.agentState.clearManagedSiblings(agentId);
    } else {
      await this.agentState.updateControlState(agentId, {
        pane_lifecycle:
          control.idle_stopped_at !== undefined &&
          control.idle_stopped_at !== null
            ? "idle-stopped"
            : "dead",
        ...(expectedSession !== null ? { last_tmux_session: expectedSession } : {}),
      });
    }

    this.tracker.markPaneDead(agentId);
    await this.appendPaneDiedLogOnce(agentId, expectedSession, control);
  }

  private hasNoResumeState(
    runtimeId: string | null,
    activeSession: string | null,
    runtimeSession: unknown,
  ): boolean {
    return runtimeId === null && activeSession === null && runtimeSession === null;
  }

  private async appendPaneDiedLogOnce(
    agentId: string,
    expectedSession: string | null,
    control: Awaited<ReturnType<AgentStateStore["readControlState"]>>,
  ): Promise<void> {
    if (
      control.pane_lifecycle === "dead" ||
      control.pane_lifecycle === "idle-stopped"
    ) {
      return;
    }

    try {
      await this.agentState.appendLog(agentId, {
        event: "pane-died",
        ...(expectedSession !== null ? { tmux_session: expectedSession } : {}),
      });
    } catch {
      // Best-effort log.
    }
  }

  private async killOrphanAgentSessions(
    sessions: FmarkTmuxSession[],
    agentIds: Set<string>,
  ): Promise<void> {
    for (const session of sessions) {
      if (
        session.kind === "agent" &&
        session.participantId &&
        !agentIds.has(session.participantId)
      ) {
        await this.killSessionBestEffort(session.sessionName);
      }
    }
  }

  private async killSessionBestEffort(sessionName: string): Promise<void> {
    try {
      await this.tmux.killSession(sessionName);
    } catch {
      // Best effort.
    }
  }
}
