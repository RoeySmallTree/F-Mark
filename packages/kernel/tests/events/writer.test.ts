import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { listParticipants } from "../../src/participants.js";
import { writeEventFile } from "../../src/events/writer.js";
import { withTempProject } from "../helpers/tempdir.js";

async function userId(p: ReturnType<typeof paths>): Promise<string> {
  const [id] = Object.keys(await listParticipants(p));
  return id!;
}

describe("writeEventFile", () => {
  it("writes a file in the session folder with the right name", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const pid = await userId(p);
      const filename = await writeEventFile(p, session.id, {
        participant_id: pid,
        kind: "prose",
        ext: "md",
        contents: "hello world",
      });
      expect(filename).toMatch(
        new RegExp(`^\\d{8}T\\d{6}Z_${pid}\\.prose\\.md$`),
      );
      const txt = await readFile(join(p.sessionDir(session.id), filename), "utf8");
      expect(txt).toBe("hello world");
    });
  });

  it("rejects unknown session id", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const pid = await userId(p);
      await expect(
        writeEventFile(p, "no-such-session", {
          participant_id: pid,
          kind: "prose",
          ext: "md",
          contents: "x",
        }),
      ).rejects.toThrow(/session/);
    });
  });

  it("rejects unregistered participant_id", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      await expect(
        writeEventFile(p, session.id, {
          participant_id: "us-9999",
          kind: "prose",
          ext: "md",
          contents: "x",
        }),
      ).rejects.toThrow(/participant/);
    });
  });

  it("rejects path traversal in session_id", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const pid = await userId(p);
      await expect(
        writeEventFile(p, "../escape", {
          participant_id: pid,
          kind: "prose",
          ext: "md",
          contents: "x",
        }),
      ).rejects.toThrow();
    });
  });

  it("ensures unique filename if called twice in the same second", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const pid = await userId(p);
      const a = await writeEventFile(p, session.id, {
        participant_id: pid,
        kind: "prose",
        ext: "md",
        contents: "first",
      });
      const b = await writeEventFile(p, session.id, {
        participant_id: pid,
        kind: "prose",
        ext: "md",
        contents: "second",
      });
      expect(a).not.toBe(b);
      const files = await readdir(p.sessionDir(session.id));
      expect(files.filter((f) => f.endsWith(".prose.md"))).toHaveLength(2);
    });
  });
});
