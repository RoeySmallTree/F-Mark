import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wrapBusWithEnvelope } from "../../src/ws/envelope.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import type { Bus, BusMessage } from "../../src/ws/bus.js";

function fakeBus(): Bus & { messages: BusMessage[] } {
  const messages: BusMessage[] = [];
  return { messages, publish: (m) => { messages.push(m); } };
}

describe("wrapBusWithEnvelope", () => {
  it("injects pathId + revision on event_added", () => {
    const scratch = mkdtempSync(join(tmpdir(), "fmark-env-"));
    const project = join(scratch, "proj");
    mkdirSync(project);
    const cfg = mkdtempSync(join(tmpdir(), "fmark-env-cfg-"));
    try {
      const ref = new PathContextRef({
        global: globalPaths(cfg),
        active: activePaths(project),
      }, 7);
      const raw = fakeBus();
      const wrapped = wrapBusWithEnvelope(raw, ref);

      wrapped.publish({
        type: "event_added",
        session_id: "s",
        filename: "f",
        kind: "prose",
        participant_id: "us-1",
      });

      expect(raw.messages).toHaveLength(1);
      const m = raw.messages[0]!;
      expect(m.type).toBe("event_added");
      expect(m.pathId).toMatch(/^[0-9a-f]{12}$/);
      expect(m.revision).toBe(7);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
      rmSync(cfg, { recursive: true, force: true });
    }
  });

  it("injects null pathId when no active path", () => {
    const cfg = mkdtempSync(join(tmpdir(), "fmark-env-cfg-"));
    try {
      const ref = new PathContextRef({
        global: globalPaths(cfg),
        active: null,
      }, 3);
      const raw = fakeBus();
      const wrapped = wrapBusWithEnvelope(raw, ref);

      wrapped.publish({
        type: "presence",
        participant_id: "ag-1",
        state: "online",
        last_hook_at: null,
      });

      expect(raw.messages[0]!.pathId).toBe(null);
      expect(raw.messages[0]!.revision).toBe(3);
    } finally {
      rmSync(cfg, { recursive: true, force: true });
    }
  });

  it("passes path-switched through unchanged (already carries its own envelope)", () => {
    const cfg = mkdtempSync(join(tmpdir(), "fmark-env-cfg-"));
    try {
      const ref = new PathContextRef({
        global: globalPaths(cfg),
        active: null,
      }, 0);
      const raw = fakeBus();
      const wrapped = wrapBusWithEnvelope(raw, ref);

      wrapped.publish({
        type: "path-switched",
        activePath: "/foo",
        pathId: "abc123def456",
        revision: 9,
      });

      const m = raw.messages[0]!;
      expect(m.type).toBe("path-switched");
      // path-switched carries its OWN pathId+revision (the new ones being announced).
      expect(m.pathId).toBe("abc123def456");
      expect(m.revision).toBe(9);
    } finally {
      rmSync(cfg, { recursive: true, force: true });
    }
  });

  it("does not overwrite explicit pathId/revision from publisher", () => {
    const cfg = mkdtempSync(join(tmpdir(), "fmark-env-cfg-"));
    try {
      const ref = new PathContextRef({
        global: globalPaths(cfg),
        active: null,
      }, 5);
      const raw = fakeBus();
      const wrapped = wrapBusWithEnvelope(raw, ref);

      wrapped.publish({
        type: "env-probe.updated",
        result: {},
        pathId: "explicitpathid",
        revision: 99,
      });

      expect(raw.messages[0]!.pathId).toBe("explicitpathid");
      expect(raw.messages[0]!.revision).toBe(99);
    } finally {
      rmSync(cfg, { recursive: true, force: true });
    }
  });

  it("PathContextRef.setRevision updates what the wrap injects", () => {
    const cfg = mkdtempSync(join(tmpdir(), "fmark-env-cfg-"));
    try {
      const ref = new PathContextRef({
        global: globalPaths(cfg),
        active: null,
      }, 1);
      const raw = fakeBus();
      const wrapped = wrapBusWithEnvelope(raw, ref);

      wrapped.publish({
        type: "presence",
        participant_id: "ag-1",
        state: "online",
        last_hook_at: null,
      });
      expect(raw.messages[0]!.revision).toBe(1);

      ref.setRevision(42);
      wrapped.publish({
        type: "presence",
        participant_id: "ag-1",
        state: "online",
        last_hook_at: null,
      });
      expect(raw.messages[1]!.revision).toBe(42);
    } finally {
      rmSync(cfg, { recursive: true, force: true });
    }
  });
});
