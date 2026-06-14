import { describe, expect, it, vi } from "vitest";
import { createSession } from "../../src/sessions.js";
import { paths } from "../../src/paths.js";
import { initProject } from "../../src/project.js";
import {
  ensureSystemForkParticipant,
  SYS_FORK_PARTICIPANT_ID,
} from "../../src/participants.js";
import { writeForkLinkPair } from "../../src/services/forkLinkWriter.js";
import { withTempProject } from "../helpers/tempdir.js";
import type { Bus, BusMessage } from "../../src/ws/bus.js";

function recordingBus(): { bus: Bus; messages: BusMessage[] } {
  const messages: BusMessage[] = [];
  const bus: Bus = {
    publish: (m) => messages.push(m),
    subscribe: () => () => {},
  };
  return { bus, messages };
}

describe("writeForkLinkPair", () => {
  it("writes both sides and publishes one event_added per session", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const src = await createSession(p, { slug: "src" });
      const fk = await createSession(p, { slug: "fk" });
      await ensureSystemForkParticipant(p);
      const { bus, messages } = recordingBus();
      const result = await writeForkLinkPair({
        p,
        sourceSessionId: src.id,
        forkSessionId: fk.id,
        sourceSlug: src.slug,
        forkSlug: fk.slug,
        timestamp: "20260530T130000.000Z",
        bus,
      });
      expect("filename" in result.source).toBe(true);
      expect("filename" in result.fork).toBe(true);
      const eventAdded = messages.filter((m) => m.type === "event_added");
      expect(eventAdded).toHaveLength(2);
      expect(eventAdded.map((m) => (m as { session_id: string }).session_id)).toEqual(
        expect.arrayContaining([src.id, fk.id]),
      );
      const onlyForkLink = eventAdded.every(
        (m) => (m as { kind: string }).kind === "fork-link",
      );
      expect(onlyForkLink).toBe(true);
      const onlySysFork = eventAdded.every(
        (m) =>
          (m as { participant_id: string }).participant_id ===
          SYS_FORK_PARTICIPANT_ID,
      );
      expect(onlySysFork).toBe(true);
    });
  });

  it("survives bus = null", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const src = await createSession(p, { slug: "s" });
      const fk = await createSession(p, { slug: "f" });
      await ensureSystemForkParticipant(p);
      const result = await writeForkLinkPair({
        p,
        sourceSessionId: src.id,
        forkSessionId: fk.id,
        sourceSlug: src.slug,
        forkSlug: fk.slug,
        timestamp: "20260530T131000.000Z",
        bus: null,
      });
      expect("filename" in result.source).toBe(true);
      expect("filename" in result.fork).toBe(true);
    });
  });

  it("returns per-side error without throwing when one session is unknown", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const src = await createSession(p, { slug: "s" });
      await ensureSystemForkParticipant(p);
      const result = await writeForkLinkPair({
        p,
        sourceSessionId: src.id,
        forkSessionId: "does-not-exist", // fork side missing
        sourceSlug: "s",
        forkSlug: "missing",
        timestamp: "20260530T132000.000Z",
        bus: null,
      });
      expect("filename" in result.source).toBe(true);
      expect("error" in result.fork).toBe(true);
      // The function MUST NOT throw — partial failure is allowed.
    });
  });

  it("returns symmetric error when source is missing", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const fk = await createSession(p, { slug: "f" });
      await ensureSystemForkParticipant(p);
      const result = await writeForkLinkPair({
        p,
        sourceSessionId: "no-source",
        forkSessionId: fk.id,
        sourceSlug: "no-source",
        forkSlug: "f",
        timestamp: "20260530T133000.000Z",
        bus: null,
      });
      expect("error" in result.source).toBe(true);
      expect("filename" in result.fork).toBe(true);
    });
  });
});

// Keep vi import used (some linters flag unused). vi is reserved for future
// mocking; reference it explicitly so vitest doesn't drop the export.
void vi;
