import { describe, it, expect } from "vitest";
import { stat } from "node:fs/promises";
import { initProject } from "../src/project.js";
import { paths } from "../src/paths.js";
import {
  createSession,
  isPlaceholderSessionId,
  isPlaceholderSessionSlug,
  listSessions,
  renameSession,
} from "../src/sessions.js";
import { withTempProject } from "./helpers/tempdir.js";

describe("sessions", () => {
  it("createSession with no slug mints a random-suffixed id with the placeholder slug", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const meta = await createSession(p, {});
      // The id must carry no name to outgrow: date + random suffix only.
      expect(meta.id).toMatch(/^\d{4}-\d{2}-\d{2}-[0-9a-f]{6}$/);
      expect(meta.slug).toBe("new-session");
      const s = await stat(p.sessionDir(meta.id));
      expect(s.isDirectory()).toBe(true);
    });
  });

  it("renameSession keeps the id immutable and only updates the slug", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const created = await createSession(p, {});
      const renamed = await renameSession(p, created.id, {
        slug: "Fix Login Flow!",
      });
      expect(renamed.id).toBe(created.id);
      expect(renamed.slug).toBe("fix-login-flow");
      const listed = await listSessions(p);
      const entry = listed.find((s) => s.id === created.id);
      expect(entry?.slug).toBe("fix-login-flow");
    });
  });

  it("placeholder detection covers collision suffixes but not real names", () => {
    expect(isPlaceholderSessionSlug("new-session")).toBe(true);
    expect(isPlaceholderSessionSlug("new-session-2")).toBe(true);
    expect(isPlaceholderSessionSlug("fix-login-flow")).toBe(false);
    expect(isPlaceholderSessionSlug("new-session-extras")).toBe(false);
    expect(isPlaceholderSessionId("2026-07-04-new-session")).toBe(true);
    expect(isPlaceholderSessionId("2026-07-04-new-session-3")).toBe(true);
    expect(isPlaceholderSessionId("2026-07-04-launch-plan")).toBe(false);
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
