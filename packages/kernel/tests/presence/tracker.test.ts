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
});
