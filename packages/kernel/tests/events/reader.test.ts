import { describe, it, expect } from "vitest";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { writeEventFile } from "../../src/events/writer.js";
import { readEvents } from "../../src/events/reader.js";
import { serializeProse } from "../../src/events/prose.js";
import { listParticipants } from "../../src/participants.js";
import { withTempProject } from "../helpers/tempdir.js";

async function userId(p: ReturnType<typeof paths>): Promise<string> {
  const [id] = Object.keys(await listParticipants(p));
  return id!;
}

describe("readEvents", () => {
  it("returns events in chronological order with parsed payloads", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const pid = await userId(p);
      await writeEventFile(p, session.id, {
        participant_id: pid,
        kind: "prose",
        ext: "md",
        contents: serializeProse({ content: "first" }),
      });
      await writeEventFile(p, session.id, {
        participant_id: pid,
        kind: "prose",
        ext: "md",
        contents: serializeProse({ content: "second", name: "doc" }),
      });
      const events = await readEvents(p, session.id, {});
      expect(events).toHaveLength(2);
      expect(events[0]!.kind).toBe("prose");
      expect((events[0]!.payload as { content: string }).content).toBe("first");
      expect((events[1]!.payload as { name?: string }).name).toBe("doc");
    });
  });

  it("filters by since", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const pid = await userId(p);
      const first = await writeEventFile(p, session.id, {
        participant_id: pid,
        kind: "prose",
        ext: "md",
        contents: "a",
      });
      await new Promise((r) => setTimeout(r, 1100));
      const second = await writeEventFile(p, session.id, {
        participant_id: pid,
        kind: "prose",
        ext: "md",
        contents: "b",
      });
      const firstTs = first.split("_")[0]!;
      const events = await readEvents(p, session.id, { since: firstTs });
      expect(events.map((e) => e.filename)).toEqual([second]);
    });
  });

  it("filters by kinds", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const pid = await userId(p);
      await writeEventFile(p, session.id, {
        participant_id: pid,
        kind: "prose",
        ext: "md",
        contents: "a",
      });
      await writeEventFile(p, session.id, {
        participant_id: pid,
        kind: "turn-end",
        ext: "json",
        contents: JSON.stringify({ participant_id: pid }),
      });
      const events = await readEvents(p, session.id, { kinds: ["turn-end"] });
      expect(events).toHaveLength(1);
      expect(events[0]!.kind).toBe("turn-end");
    });
  });

  it("filters by participant", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const pid = await userId(p);
      await writeEventFile(p, session.id, {
        participant_id: pid,
        kind: "prose",
        ext: "md",
        contents: "from user",
      });
      const events = await readEvents(p, session.id, { participant: "ag-none" });
      expect(events).toHaveLength(0);
    });
  });
});
