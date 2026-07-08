import type {
  EnsureManagedAgentsResponse,
  WakeSessionRequest,
  WakeSessionResponse,
} from "@f-mark/shared";
import { readInbox } from "../../compass/inbox.js";
import { buildCompassPacket, buildWakePrompt } from "../../compass/packet.js";
import { readSessionSlug } from "../../sessions.js";
import { loadRuntimeRegistry } from "../../runtimes/store.js";
import type { InputQueue } from "../../tmux/inputQueue.js";
import type { TmuxManager } from "../../tmux/manager.js";
import { waitForRuntimeReady } from "./launchService.js";
import type { ManagedAgentRootBinding } from "./types.js";

type WakeRouteResult = {
  status: number;
  body: WakeSessionResponse | { error: string };
};

interface ManagedAgentWakeServiceDeps {
  tmux: TmuxManager;
  inputQueue: InputQueue;
  ensureForSession(input: {
    sessionId: string;
    binding: ManagedAgentRootBinding;
    targetParticipantIds?: string[];
    includeNotActiveSkips: boolean;
    idleOnly?: boolean;
  }): Promise<EnsureManagedAgentsResponse>;
  publishAgentUpdated(
    participantId: string,
    binding?: ManagedAgentRootBinding | null,
  ): Promise<void>;
  scheduleTerminalAccessPolling(input: {
    participantId: string;
    runtimeId: string | null;
    binding?: ManagedAgentRootBinding | null;
  }): void;
  scheduleCodexLiveTextPolling(input: {
    participantId: string;
    sessionId: string | null | undefined;
    runtimeId: string | null | undefined;
    binding?: ManagedAgentRootBinding | null;
    reset?: boolean;
  }): void;
}

export class ManagedAgentWakeService {
  constructor(private readonly deps: ManagedAgentWakeServiceDeps) {}

  async wake(input: {
    sessionId: string;
    binding: ManagedAgentRootBinding;
    body: WakeSessionRequest;
  }): Promise<WakeRouteResult> {
    const requested = input.body.target_participant_ids;
    if (requested !== undefined && !Array.isArray(requested)) {
      return {
        status: 400,
        body: { error: "target_participant_ids must be an array" },
      };
    }

    const targetIds =
      requested !== undefined
        ? [...new Set(requested.map((value) => String(value)))]
        : undefined;
    const ensure = await this.deps.ensureForSession({
      sessionId: input.sessionId,
      binding: input.binding,
      targetParticipantIds: targetIds,
      includeNotActiveSkips: requested !== undefined,
    });
    const ready = this.readyTargets(ensure);
    const delivered: WakeSessionResponse["delivered"] = [];
    const skipped: WakeSessionResponse["skipped"] = [...ensure.skipped];

    for (const [participantId, tmuxSession] of ready.targets.entries()) {
      const delivery = await this.deliverWakePrompt({
        sessionId: input.sessionId,
        participantId,
        tmuxSession,
        binding: input.binding,
        body: input.body,
        resumed: ready.resumed.has(participantId),
      });
      if ("skipped" in delivery) skipped.push(delivery.skipped);
      else delivered.push(delivery.delivered);
    }

    return {
      status: 200,
      body: {
        session_id: input.sessionId,
        notified: delivered.map((agent) => agent.participant_id),
        delivered,
        skipped,
        event_count: delivered.reduce((sum, agent) => sum + agent.event_count, 0),
      },
    };
  }

  private readyTargets(
    ensure: EnsureManagedAgentsResponse,
  ): { targets: Map<string, string>; resumed: Set<string> } {
    const targets = new Map<string, string>();
    const resumed = new Set<string>();
    for (const agent of ensure.already_live) {
      targets.set(agent.participant_id, agent.tmux_session);
    }
    for (const agent of ensure.resumed) {
      targets.set(agent.participant_id, agent.tmux_session);
      resumed.add(agent.participant_id);
    }
    return { targets, resumed };
  }

  private async deliverWakePrompt(input: {
    sessionId: string;
    participantId: string;
    tmuxSession: string;
    binding: ManagedAgentRootBinding;
    body: WakeSessionRequest;
    resumed: boolean;
  }): Promise<
    | { delivered: WakeSessionResponse["delivered"][number] }
    | { skipped: WakeSessionResponse["skipped"][number] }
  > {
    const p = input.binding.paths;
    const state = input.binding.state;
    const snapshot = await readInbox({
      paths: p,
      state,
      sessionId: input.sessionId,
      participantId: input.participantId,
      markSeen: false,
    });
    const packet = buildCompassPacket({
      sessionId: input.sessionId,
      sessionSlug: await readSessionSlug(p, input.sessionId),
      participantId: input.participantId,
      reason: input.body.reason,
      sourceEvent: input.body.source_event,
      cursorBefore: snapshot.cursor_before,
      events: snapshot.events,
    });
    const runtimeId = await state.readRuntime(input.participantId);
    if (packet.event_count === 0) {
      return {
        skipped: {
          participant_id: input.participantId,
          reason: "no-unread-events",
        },
      };
    }
    if (input.resumed && runtimeId !== null) {
      await this.waitForReady({
        p,
        tmuxSession: input.tmuxSession,
        runtimeId,
      });
    }

    const prompt = buildWakePrompt(packet);
    await this.deps.inputQueue.enqueue(input.tmuxSession, () =>
      this.deps.tmux.deliverPrompt(input.tmuxSession, prompt),
    );
    const controlPatch: Parameters<typeof state.updateControlState>[1] = {
      activity_state: "notified",
      last_activity_at: new Date().toISOString(),
      idle_stopped_at: null,
      idle_stop_reason: null,
      last_tmux_session: input.tmuxSession,
      pane_lifecycle: "live",
    };
    await state.updateControlState(input.participantId, controlPatch);
    this.deps.scheduleTerminalAccessPolling({
      participantId: input.participantId,
      runtimeId,
      binding: input.binding,
    });
    this.deps.scheduleCodexLiveTextPolling({
      participantId: input.participantId,
      sessionId: input.sessionId,
      runtimeId,
      binding: input.binding,
      reset: runtimeId === "codex",
    });
    await this.deps.publishAgentUpdated(input.participantId, input.binding);

    return {
      delivered: {
        participant_id: input.participantId,
        tmux_session: input.tmuxSession,
        cursor_before: snapshot.cursor_before,
        cursor_after: packet.cursor_after,
        event_count: packet.event_count,
      },
    };
  }

  private async waitForReady(input: {
    p: ManagedAgentRootBinding["paths"];
    tmuxSession: string;
    runtimeId: string;
  }): Promise<void> {
    try {
      const runtimes = await loadRuntimeRegistry({ fallback: input.p });
      await waitForRuntimeReady({
        tmux: this.deps.tmux,
        sessionName: input.tmuxSession,
        runtimeId: input.runtimeId,
        timeoutMs: runtimes.runtimes[input.runtimeId]?.readyDelayMs ?? 0,
      });
    } catch {
      // Readiness is best-effort; the input queue still serializes delivery.
    }
  }
}
