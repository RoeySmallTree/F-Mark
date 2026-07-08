import type {
  EnsureManagedAgentsResponse,
  IntegrationApplyResponse,
} from "@f-mark/shared";
import { ensureProjectAuth } from "../../auth.js";
import { cleanupStaleFmarkMcpProcesses } from "../../mcp/runtimeRegistry.js";
import { listParticipants } from "../../participants.js";
import type { PathContextRef } from "../../paths/contextRef.js";
import { globalPaths, resolveConfigRoot } from "../../paths/global.js";
import type { Paths } from "../../paths.js";
import { initProject, readConfig, writeConfig } from "../../project.js";
import type { AgentStateStore } from "../../services/agentState.js";
import type { PresenceTracker } from "../../presence/tracker.js";
import { applyIntegration } from "../../mcpInstall/index.js";
import {
  hookInstallScopeFor,
  writeHookScopePreference,
} from "../../mcpInstall/scopePreference.js";
import type { TmuxManager } from "../../tmux/manager.js";
import type { Bus } from "../../ws/bus.js";
import type { McpHttpController } from "../../mcp/http.js";

type EnsureSkippedReason = EnsureManagedAgentsResponse["skipped"][number]["reason"];

interface ManagedAgentIntegrationServiceDeps {
  paths: Paths;
  tmux: TmuxManager;
  tracker: PresenceTracker;
  bus: Bus;
  agentState(): AgentStateStore;
  authToken?: string | null;
  kernelPort?: number;
  pathContextRef?: PathContextRef;
  mcpHttpController?: McpHttpController;
}

export class ManagedAgentIntegrationService {
  constructor(private readonly deps: ManagedAgentIntegrationServiceDeps) {}

  async ensureLaunchProjectConnection(p: Paths): Promise<void> {
    await initProject(p, this.deps.kernelPort);
    await ensureProjectAuth(p, this.deps.authToken ?? null);
    if (this.deps.kernelPort === undefined) return;
    const cfg = await readConfig(p);
    if (cfg.port === this.deps.kernelPort && cfg.host === "localhost") return;
    cfg.port = this.deps.kernelPort;
    cfg.host = "localhost";
    await writeConfig(p, cfg);
  }

  async firstUserParticipantId(p: Paths): Promise<string | undefined> {
    try {
      const participants = await listParticipants(p, {
        agentState: this.deps.agentState(),
      });
      for (const [id, participant] of Object.entries(participants)) {
        if (participant.kind === "user") return id;
      }
    } catch {
      // Preflight/apply can still proceed for runtimes that do not need a
      // user hook id; Codex will return a clear apply error if one is needed.
    }
    return undefined;
  }

  async applyIntegrationWithManagedCleanup(
    input: Parameters<typeof applyIntegration>[0] & {
      p: Paths;
      state: AgentStateStore;
    },
  ): Promise<IntegrationApplyResponse> {
    const { p, state, ...applyInput } = input;
    const applied = await applyIntegration(applyInput);
    await writeHookScopePreference(
      applyInput.runtimeId,
      hookInstallScopeFor(applyInput.runtimeId, applied.chosen_scope),
      globalPaths(resolveConfigRoot(applyInput.env ?? process.env)),
    ).catch(() => undefined);
    const cleanup = await this.cleanupAfterMcpApply({
      p,
      state,
      runtimeId: applyInput.runtimeId,
      mcpChanged: applied.mcp_changed === true,
    });
    return { ...applied, cleanup };
  }

  private emptyIntegrationCleanup(): NonNullable<
    IntegrationApplyResponse["cleanup"]
  > {
    return {
      killed_mcp_pids: [],
      killed_agents: [],
      closed_http_sessions: 0,
      errors: [],
    };
  }

  private async cleanupManagedAgentsForMcpUpdate(input: {
    p: Paths;
    state: AgentStateStore;
    runtimeId: string;
  }): Promise<{ killedAgents: string[]; errors: string[] }> {
    const killedAgents: string[] = [];
    const errors: string[] = [];
    const participants = await listParticipants(input.p, {
      agentState: input.state,
    });
    for (const [participantId, participant] of Object.entries(participants)) {
      if (participant.kind !== "agent") continue;
      const runtimeId =
        participant.runtime_id ?? (await input.state.readRuntime(participantId));
      if (runtimeId !== input.runtimeId) continue;
      const tmuxSession = await input.state.readTmuxSession(participantId);
      if (tmuxSession === null) continue;
      try {
        await this.deps.tmux.killSession(tmuxSession);
      } catch (err) {
        errors.push(
          `failed to kill managed agent ${participantId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      await input.state.clearManagedSiblings(participantId);
      this.deps.tracker.clearManagedPane(participantId);
      await input.state.appendLog(participantId, {
        event: "mcp-config-updated",
        runtime: input.runtimeId,
        tmux_session: tmuxSession,
      });
      this.deps.bus.publish({
        type: "managed-agent.killed",
        participant_id: participantId,
      });
      killedAgents.push(participantId);
    }
    return { killedAgents, errors };
  }

  private async cleanupAfterMcpApply(input: {
    p: Paths;
    state: AgentStateStore;
    runtimeId: string;
    mcpChanged: boolean;
  }): Promise<NonNullable<IntegrationApplyResponse["cleanup"]>> {
    const cleanup = this.emptyIntegrationCleanup();
    if (!input.mcpChanged) return cleanup;

    const pidCleanup = await cleanupStaleFmarkMcpProcesses({
      fmarkDir: input.p.fmarkDir(),
      projectRoot: input.p.root(),
      runtimeId: input.runtimeId,
    });
    cleanup.killed_mcp_pids.push(...pidCleanup.killed_mcp_pids);
    cleanup.errors.push(...pidCleanup.errors);

    try {
      cleanup.closed_http_sessions =
        (await this.deps.mcpHttpController?.closeAllSessionsForRoot(
          input.p.root(),
        )) ?? 0;
    } catch (err) {
      cleanup.errors.push(
        `failed to close HTTP MCP sessions: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const managedCleanup = await this.cleanupManagedAgentsForMcpUpdate({
      p: input.p,
      state: input.state,
      runtimeId: input.runtimeId,
    });
    cleanup.killed_agents.push(...managedCleanup.killedAgents);
    cleanup.errors.push(...managedCleanup.errors);
    return cleanup;
  }
}

export type { EnsureSkippedReason };
