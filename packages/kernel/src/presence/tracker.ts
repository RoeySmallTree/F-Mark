export type PresenceState =
  | "launching"
  | "online"
  | "stale"
  | "offline"
  | "pane-dead"
  | "hook-not-installed";

export interface PresenceEntry {
  state: PresenceState;
  lastHookAt: number | null;
  paneAlive?: () => boolean;
  hooksInstalled?: boolean;
}

export interface PresenceTracker {
  ping(participantId: string): void;
  setManagedPane(participantId: string, opts: { paneAlive: () => boolean }): void;
  clearManagedPane(participantId: string): void;
  setManagedHookStatus(participantId: string, installed: boolean): void;
  tick(): void;
  snapshot(): Map<string, { state: PresenceState; lastHookAt: number | null }>;
  remove(participantId: string): void;
}

const ONLINE_TTL_MS = 60_000;
const ONLINE_MANAGED_TTL_MS = 120_000;
const OFFLINE_TTL_MS = 600_000;

export interface CreateTrackerDeps {
  broadcast(msg: {
    type: "presence";
    participant_id: string;
    state: PresenceState;
    last_hook_at: number | null;
  }): void;
  now?: () => number;
}

export function createPresenceTracker(deps: CreateTrackerDeps): PresenceTracker {
  const now = deps.now ?? (() => Date.now());
  const map = new Map<string, PresenceEntry>();

  function deriveState(e: PresenceEntry, nowMs: number): PresenceState {
    if (e.paneAlive && !e.paneAlive()) return "pane-dead";
    if (e.hooksInstalled === false && e.lastHookAt === null) return "hook-not-installed";
    if (e.lastHookAt === null) return "launching";
    const age = nowMs - e.lastHookAt;
    const onlineCap = e.paneAlive ? ONLINE_MANAGED_TTL_MS : ONLINE_TTL_MS;
    if (age <= onlineCap) return "online";
    if (age <= OFFLINE_TTL_MS) return "stale";
    return "offline";
  }

  function emit(id: string, e: PresenceEntry, prev: PresenceState | undefined): void {
    if (prev === e.state) return;
    deps.broadcast({
      type: "presence",
      participant_id: id,
      state: e.state,
      last_hook_at: e.lastHookAt,
    });
  }

  return {
    ping(id) {
      const t = now();
      const cur = map.get(id) ?? { state: "launching", lastHookAt: null };
      const prev = cur.state;
      cur.lastHookAt = t;
      cur.state = deriveState(cur, t);
      map.set(id, cur);
      emit(id, cur, prev);
    },
    setManagedPane(id, { paneAlive }) {
      const t = now();
      const cur = map.get(id) ?? { state: "launching", lastHookAt: null };
      const prev = cur.state;
      cur.paneAlive = paneAlive;
      cur.state = deriveState(cur, t);
      map.set(id, cur);
      emit(id, cur, prev);
    },
    clearManagedPane(id) {
      const t = now();
      const cur = map.get(id);
      if (!cur) return;
      const prev = cur.state;
      delete cur.paneAlive;
      cur.state = deriveState(cur, t);
      emit(id, cur, prev);
    },
    setManagedHookStatus(id, installed) {
      const t = now();
      const cur = map.get(id) ?? { state: "launching", lastHookAt: null };
      const prev = cur.state;
      cur.hooksInstalled = installed;
      cur.state = deriveState(cur, t);
      map.set(id, cur);
      emit(id, cur, prev);
    },
    tick() {
      const t = now();
      for (const [id, e] of map.entries()) {
        const prev = e.state;
        e.state = deriveState(e, t);
        emit(id, e, prev);
      }
    },
    snapshot() {
      const out = new Map<string, { state: PresenceState; lastHookAt: number | null }>();
      for (const [id, e] of map.entries()) {
        out.set(id, { state: e.state, lastHookAt: e.lastHookAt });
      }
      return out;
    },
    remove(id) {
      map.delete(id);
    },
  };
}
