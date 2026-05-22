import { describe, it, expect } from "vitest";
import { stat } from "node:fs/promises";
import { initProject } from "../src/project.js";
import { paths } from "../src/paths.js";
import { createSession, listSessions } from "../src/sessions.js";
import { withTempProject } from "./helpers/tempdir.js";

describe("sessions", () => {
  it("createSession with no slug uses 'untitled' and today's date", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const meta = await createSession(p, {});
      expect(meta.id).toMatch(/^\d{4}-\d{2}-\d{2}-untitled$/);
      const s = await stat(p.sessionDir(meta.id));
      expect(s.isDirectory()).toBe(true);
    });
  });

  it("createSession with slug normalises and uses it", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const meta = await createSession(p, { slug: "Launch Plan!" });
      expect(meta.id).toMatch(/^\d{4}-\d{2}-\d{2}-launch-plan$/);
    });
  });

  it("createSession deduplicates by appending -2, -3...", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const a = await createSession(p, { slug: "x" });
      const b = await createSession(p, { slug: "x" });
      const c = await createSession(p, { slug: "x" });
      expect(a.id).not.toBe(b.id);
      expect(b.id).not.toBe(c.id);
      expect(b.id.endsWith("-2") || c.id.endsWith("-2")).toBe(true);
    });
  });

  it("listSessions returns created sessions sorted newest first", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const a = await createSession(p, { slug: "alpha" });
      await new Promise((r) => setTimeout(r, 10));
      const b = await createSession(p, { slug: "bravo" });
      const list = await listSessions(p);
      expect(list.map((x) => x.id)).toEqual([b.id, a.id]);
    });
  });

  it("createSession rejects slugs with path traversal", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      await expect(createSession(p, { slug: "../escape" })).rejects.toThrow();
    });
  });
});
