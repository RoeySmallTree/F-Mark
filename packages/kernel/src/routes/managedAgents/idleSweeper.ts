import type { PresenceTracker } from "../../presence/tracker.js";
import type { Paths } from "../../paths.js";
import type { PathContextRef } from "../../paths/contextRef.js";
import { listRegisteredProjectPaths } from "../../paths/registry.js";
import {
  createAgentStateStoreForRoot,
  type AgentStateStore,
} from "../../services/agentState.js";
import { readState } from "../../state/store.js";
import type { ListedSession, TmuxManager } from "../../tmux/manager.js";

const IDLE_TMUX_TTL_MS = 60 * 60 * 1000;
const IDLE_TMUX_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

type ControlState = Awaited<ReturnType<AgentStateStore["readControlState"]>>;

interface SweepRoot {
  root: string;
}

interface IdleSweeperDeps {
  paths: Paths;
  tmux: TmuxManager;
  tracker: PresenceTracker;
  pathContextRef?: PathContextRef;
  intervalMs?: number;
  ttlMs?: number;
  publishUpdated?: (participantId: string, root: string) => Promise<void>;
}

interface SweepOptions {
  now?: () => number;
  ttlMs?: number;
}

export interface IdleSweepResult {
  stopped: Array<{
    participant_id: string;
    tmux_session: string;
    root: string;
  }>;
  skipped: Array<{
    participant_id: string;
    reason: string;
    root: string;
  }>;
}

type SessionSweepOutcome =
  | { kind: "stopped"; participantId: string; tmuxSession: string }
  | { kind: "skipped"; participantId: string; reason: string };

function parseTimeMs(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function maxTimeMs(values: Array<string | null | undefined>): number {
  let max = 0;
  for (const value of values) {
    const ms = parseTimeMs(value);
    if (ms !== null && ms > max) max = ms;
  }
  return max;
}

function idleReferenceMs(input: {
  tmuxActivityAt?: string;
  control: ControlState;
}): number {
  return maxTimeMs([
    input.tmuxActivityAt,
    input.control.last_tmux_activity_at,
    input.control.last_activity_at,
    input.control.updated_at,
  ]);
}

export class ManagedAgentIdleSweeper {
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: IdleSweeperDeps) {}

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(
      () => void this.tick(),
      this.deps.intervalMs ?? IDLE_TMUX_SWEEP_INTERVAL_MS,
    );
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async sweep(options: SweepOptions = {}): Promise<IdleSweepResult> {
    const nowMs = options.now?.() ?? Date.now();
    const ttlMs = options.ttlMs ?? this.deps.ttlMs ?? IDLE_TMUX_TTL_MS;
    const result: IdleSweepResult = { stopped: [], skipped: [] };
    const roots = await this.sweepRoots();

    for (const rootInfo of roots) {
      const rootResult = await this.sweepRoot(rootInfo, nowMs, ttlMs);
      result.stopped.push(...rootResult.stopped);
      result.skipped.push(...rootResult.skipped);
    }

    return result;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.sweep();
    } catch {
      // Best-effort background cleanup; route-triggered resume is canonical.
    } finally {
      this.running = false;
    }
  }

  private async sweepRoots(): Promise<SweepRoot[]> {
    const ref = this.deps.pathContextRef;
    if (ref === undefined) return [{ root: this.deps.paths.root() }];

    const roots = new Set<string>();
    const active = ref.get().active;
    if (active !== null) roots.add(active.root());

    try {
      for (const root of await listRegisteredProjectPaths(ref.global())) {
        roots.add(root);
      }
    } catch {
      // Best-effort: the active root is enough for legacy and most tests.
    }

    try {
      const state = await readState(ref.global());
      for (const root of state.knownPaths) roots.add(root);
      if (state.activePath !== null) roots.add(state.activePath);
    } catch {
      // Same best-effort fallback as above.
    }

    return [...roots].map((root) => ({ root }));
  }

  private async sweepRoot(
    rootInfo: SweepRoot,
    nowMs: number,
    ttlMs: number,
  ): Promise<IdleSweepResult> {
    const root = rootInfo.root;
    const state = createAgentStateStoreForRoot(
      root,
      this.deps.pathContextRef?.global(),
    );
    const managedIds = new Set(await state.listManagedAgentIds());
    const sessions = await this.deps.tmux.listFmarkSessions(root);
    const result: IdleSweepResult = { stopped: [], skipped: [] };

    for (const session of sessions) {
      const outcome = await this.sweepSession({
        session,
        root,
        state,
        managedIds,
        nowMs,
        ttlMs,
      });
      if (outcome === null) continue;
      if (outcome.kind === "stopped") {
        result.stopped.push({
          participant_id: outcome.participantId,
          tmux_session: outcome.tmuxSession,
          root,
        });
      } else {
        result.skipped.push({
          participant_id: outcome.participantId,
          reason: outcome.reason,
          root,
        });
      }
    }

    return result;
  }

  private async sweepSession(input: {
    session: ListedSession;
    root: string;
    state: AgentStateStore;
    managedIds: Set<string>;
    nowMs: number;
    ttlMs: number;
  }): Promise<SessionSweepOutcome | null> {
    const { session, root, state, managedIds, nowMs, ttlMs } = input;
    if (session.kind !== "agent" || session.participantId === undefined) {
      return null;
    }

    const participantId = session.participantId;
    if (!managedIds.has(participantId)) {
      return { kind: "skipped", participantId, reason: "orphan" };
    }

    const control = await state.readControlState(participantId);
    if (control.activity_state === "access-pending") {
      return { kind: "skipped", participantId, reason: "access-pending" };
    }

    if (!this.isExpired(session.lastActivityAt, control, nowMs, ttlMs)) {
      return { kind: "skipped", participantId, reason: "active" };
    }

    const recheckedAlive = await this.deps.tmux.isLiveFmarkSession(
      session.sessionName,
      root,
    );
    if (!recheckedAlive) {
      return { kind: "skipped", participantId, reason: "already-missing" };
    }

    await this.stopIdleSession({
      state,
      participantId,
      root,
      session,
      control,
      nowMs,
    });
    return {
      kind: "stopped",
      participantId,
      tmuxSession: session.sessionName,
    };
  }

  private isExpired(
    tmuxActivityAt: string | undefined,
    control: ControlState,
    nowMs: number,
    ttlMs: number,
  ): boolean {
    const referenceMs = idleReferenceMs({ tmuxActivityAt, control });
    return nowMs - referenceMs >= ttlMs;
  }

  private async stopIdleSession(input: {
    state: AgentStateStore;
    participantId: string;
    root: string;
    session: ListedSession;
    control: ControlState;
    nowMs: number;
  }): Promise<void> {
    const { state, participantId, root, session, control, nowMs } = input;
    await this.deps.tmux.killSession(session.sessionName);
    const stoppedAt = new Date(nowMs).toISOString();
    await state.updateControlState(participantId, {
      activity_state: "idle",
      idle_stopped_at: stoppedAt,
      idle_stop_reason: "idle-timeout",
      last_tmux_session: session.sessionName,
      last_tmux_activity_at: session.lastActivityAt,
      pane_lifecycle: "idle-stopped",
    });
    this.deps.tracker.markPaneDead(participantId);
    await state.appendLog(participantId, {
      event: "idle-timeout-stopped",
      tmux_session: session.sessionName,
      idle_stopped_at: stoppedAt,
      last_tmux_activity_at: session.lastActivityAt ?? null,
      last_activity_at: control.last_activity_at ?? null,
      updated_at: control.updated_at ?? null,
    });
    await this.deps.publishUpdated?.(participantId, root);
  }
}

export async function sweepIdleManagedAgentPanes(input: {
  paths: Paths;
  tmux: TmuxManager;
  tracker: PresenceTracker;
  pathContextRef?: PathContextRef;
  now?: () => number;
  ttlMs?: number;
  publishUpdated?: (participantId: string, root: string) => Promise<void>;
}): Promise<IdleSweepResult> {
  return new ManagedAgentIdleSweeper(input).sweep({
    now: input.now,
    ttlMs: input.ttlMs,
  });
}
