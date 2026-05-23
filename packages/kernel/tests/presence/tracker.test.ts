import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createPresenceTracker } from "../../src/presence/tracker.js";

describe("PresenceTracker", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("ping sets online and broadcasts state change", () => {
    const broadcasts: unknown[] = [];
    const t = createPresenceTracker({ broadcast: (m) => broadcasts.push(m) });
    t.ping("ag-claude");
    const s = t.snapshot().get("ag-claude");
    expect(s?.state).toBe("online");
    expect(broadcasts).toHaveLength(1);
  });

  it("idempotent broadcasts: same state does not re-emit", () => {
    const broadcasts: unknown[] = [];
    const t = createPresenceTracker({ broadcast: (m) => broadcasts.push(m) });
    t.ping("ag-claude");
    t.ping("ag-claude");
    expect(broadcasts).toHaveLength(1);
  });

  it("transitions to stale after 60s without ping", () => {
    const broadcasts: any[] = [];
    const t = createPresenceTracker({ broadcast: (m) => broadcasts.push(m) });
    t.ping("ag-claude");
    vi.advanceTimersByTime(61_000);
    t.tick();
    expect(t.snapshot().get("ag-claude")?.state).toBe("stale");
    expect(broadcasts.at(-1).state).toBe("stale");
  });

  it("stretched threshold for managed-with-pane-alive: stays online up to 120s", () => {
    const t = createPresenceTracker({ broadcast: () => {} });
    t.setManagedPane("ag-claude", { paneAlive: () => true });
    t.ping("ag-claude");
    vi.advanceTimersByTime(90_000);
    t.tick();
    expect(t.snapshot().get("ag-claude")?.state).toBe("online");
    vi.advanceTimersByTime(40_000);
    t.tick();
    expect(t.snapshot().get("ag-claude")?.state).toBe("stale");
  });

  it("transitions to offline after 10m", () => {
    const t = createPresenceTracker({ broadcast: () => {} });
    t.ping("ag-x");
    vi.advanceTimersByTime(601_000);
    t.tick();
    expect(t.snapshot().get("ag-x")?.state).toBe("offline");
  });

  it("pane-dead state when managed pane stops being alive", () => {
    const t = createPresenceTracker({ broadcast: () => {} });
    let alive = true;
    t.setManagedPane("ag-x", { paneAlive: () => alive });
    t.ping("ag-x");
    alive = false;
    t.tick();
    expect(t.snapshot().get("ag-x")?.state).toBe("pane-dead");
  });

  it("setManagedHookStatus(false) at spawn yields hook-not-installed even with no pings", () => {
    const t = createPresenceTracker({ broadcast: () => {} });
    t.setManagedHookStatus("ag-x", false);
    expect(t.snapshot().get("ag-x")?.state).toBe("hook-not-installed");
    t.ping("ag-x");
    expect(t.snapshot().get("ag-x")?.state).toBe("online");
  });

  it("ping() uses a single now() so a time-warping clock cannot stale the fresh ping", () => {
    // Simulate a clock that advances by 10 minutes between successive now() reads.
    // If ping() reads `now()` twice (once to stamp, once to derive), the derived
    // state will be `offline` (age = 600s). With a single captured `now()` the
    // derived state must be `online`.
    let calls = 0;
    const t = createPresenceTracker({
      broadcast: () => {},
      now: () => {
        const base = 1_000_000;
        const offset = calls * 600_000;
        calls += 1;
        return base + offset;
      },
    });
    t.ping("ag-x");
    expect(t.snapshot().get("ag-x")?.state).toBe("online");
  });

  it("launching: setManagedPane with no ping yet leaves state at 'launching'", () => {
    const t = createPresenceTracker({ broadcast: () => {} });
    t.setManagedPane("ag-x", { paneAlive: () => true });
    expect(t.snapshot().get("ag-x")?.state).toBe("launching");
  });

  it("managed 120s threshold transition broadcasts the stale state", () => {
    const broadcasts: any[] = [];
    const t = createPresenceTracker({ broadcast: (m) => broadcasts.push(m) });
    t.setManagedPane("ag-claude", { paneAlive: () => true });
    t.ping("ag-claude");
    broadcasts.length = 0;
    vi.advanceTimersByTime(121_000);
    t.tick();
    expect(t.snapshot().get("ag-claude")?.state).toBe("stale");
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]).toMatchObject({
      type: "presence",
      participant_id: "ag-claude",
      state: "stale",
    });
  });

  it("pane-dead transition broadcasts the pane-dead state", () => {
    const broadcasts: any[] = [];
    const t = createPresenceTracker({ broadcast: (m) => broadcasts.push(m) });
    let alive = true;
    t.setManagedPane("ag-x", { paneAlive: () => alive });
    t.ping("ag-x");
    broadcasts.length = 0;
    alive = false;
    t.tick();
    expect(t.snapshot().get("ag-x")?.state).toBe("pane-dead");
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]).toMatchObject({
      type: "presence",
      participant_id: "ag-x",
      state: "pane-dead",
    });
  });

  it("markReconciledStale sets state to stale with managed pane", () => {
    const t = createPresenceTracker({ broadcast: () => {} });
    t.markReconciledStale("ag-x", { paneAlive: () => true });
    expect(t.snapshot().get("ag-x")?.state).toBe("stale");
  });

  it("markReconciledStale broadcasts the stale state and a subsequent ping flips to online", () => {
    const broadcasts: any[] = [];
    const t = createPresenceTracker({ broadcast: (m) => broadcasts.push(m) });
    t.markReconciledStale("ag-x", { paneAlive: () => true });
    expect(broadcasts.at(-1)).toMatchObject({
      type: "presence",
      participant_id: "ag-x",
      state: "stale",
    });
    t.ping("ag-x");
    expect(t.snapshot().get("ag-x")?.state).toBe("online");
    expect(broadcasts.at(-1)).toMatchObject({
      type: "presence",
      participant_id: "ag-x",
      state: "online",
    });
  });

  it("markPaneDead sets state to pane-dead", () => {
    const t = createPresenceTracker({ broadcast: () => {} });
    t.setManagedPane("ag-x", { paneAlive: () => true });
    t.ping("ag-x");
    expect(t.snapshot().get("ag-x")?.state).toBe("online");
    t.markPaneDead("ag-x");
    expect(t.snapshot().get("ag-x")?.state).toBe("pane-dead");
  });

  it("markPaneDead creates a pane-dead entry even when no prior entry exists", () => {
    const broadcasts: any[] = [];
    const t = createPresenceTracker({ broadcast: (m) => broadcasts.push(m) });
    t.markPaneDead("ag-x");
    expect(t.snapshot().get("ag-x")?.state).toBe("pane-dead");
    expect(broadcasts.at(-1)).toMatchObject({
      type: "presence",
      participant_id: "ag-x",
      state: "pane-dead",
    });
  });

  it("stale -> offline two-step transition: ticks through both states and broadcasts each", () => {
    const broadcasts: any[] = [];
    const t = createPresenceTracker({ broadcast: (m) => broadcasts.push(m) });
    t.ping("ag-x");
    expect(broadcasts.at(-1).state).toBe("online");
    // Past 60s -> stale
    vi.advanceTimersByTime(90_000);
    t.tick();
    expect(t.snapshot().get("ag-x")?.state).toBe("stale");
    expect(broadcasts.at(-1)).toMatchObject({
      type: "presence",
      participant_id: "ag-x",
      state: "stale",
    });
    // Push total age past 600s -> offline
    vi.advanceTimersByTime(600_000);
    t.tick();
    expect(t.snapshot().get("ag-x")?.state).toBe("offline");
    expect(broadcasts.at(-1)).toMatchObject({
      type: "presence",
      participant_id: "ag-x",
      state: "offline",
    });
    // Three distinct broadcasts: online -> stale -> offline
    const states = broadcasts.map((b) => b.state);
    expect(states).toEqual(["online", "stale", "offline"]);
  });
});
