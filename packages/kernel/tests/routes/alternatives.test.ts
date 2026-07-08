import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { listParticipants } from "../../src/participants.js";
import { withTempProject } from "../helpers/tempdir.js";

async function setup(root: string) {
  const p = paths(root);
  await initProject(p);
  const session = await createSession(p, { slug: "x" });
  const [pid] = Object.keys(await listParticipants(p));
  const { app } = createServer({ token: null, paths: p });
  return { p, app, sessionId: session.id, pid: pid! };
}

describe("POST /sessions/:id/events/alternatives", () => {
  it("writes one html bundle per option + a choices event referencing them", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/alternatives`,
        payload: {
          root,
          participant_id: pid,
          id: "ch_design",
          question: "Which layout?",
          multi: false,
          options: [
            { id: "a", label: "Alpha", html: "<h1>Alpha page</h1>", css: "h1{color:teal}" },
            { id: "b", label: "Beta", html: "<h1>Beta page</h1>" },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.filename).toMatch(/\.choices\.json$/);
      expect(body.kind).toBe("choices");
      expect(body.html).toHaveLength(2);
      expect(body.html[0]).toMatchObject({ option_id: "a" });
      expect(body.html[0].filename).toMatch(/\.html$/);

      // The choices event options carry the generated bundle filenames.
      const choices = JSON.parse(
        await readFile(join(p.sessionDir(sessionId), body.filename), "utf8"),
      );
      expect(choices.options).toHaveLength(2);
      expect(choices.options[0].html).toBe(body.html[0].filename);
      expect(choices.options[1].html).toBe(body.html[1].filename);

      // Each bundle's index.html is served and carries the option content.
      const alpha = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/raw/${body.html[0].filename}/index.html`,
      });
      expect(alpha.statusCode).toBe(200);
      expect(alpha.body).toContain("Alpha page");

      // The css companion is written for the option that supplied it.
      const css = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/raw/${body.html[0].filename}/style.css`,
      });
      expect(css.statusCode).toBe(200);
      expect(css.body).toContain("teal");
      await app.close();
    });
  });

  it("rejects (400) and writes no bundles when option ids are duplicated", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/alternatives`,
        payload: {
          root,
          participant_id: pid,
          id: "ch_dup",
          question: "Which?",
          multi: false,
          options: [
            { id: "a", label: "Alpha", html: "<h1>A</h1>" },
            { id: "a", label: "Beta", html: "<h1>B</h1>" },
          ],
        },
      });
      expect(res.statusCode).toBe(400);
      const entries = await readdir(p.sessionDir(sessionId));
      expect(entries.filter((e) => e.endsWith(".html"))).toHaveLength(0);
      await app.close();
    });
  });

  it("rejects (400) an empty options array", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/alternatives`,
        payload: {
          root,
          participant_id: pid,
          id: "x",
          question: "?",
          multi: false,
          options: [],
        },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("rejects a multi-select question sent with multi false before writing bundles", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/alternatives`,
        payload: {
          root,
          participant_id: pid,
          id: "ch_mismatch",
          question: "Pick one (or more to mix):",
          multi: false,
          options: [
            { id: "a", label: "Alpha", html: "<h1>A</h1>" },
            { id: "b", label: "Beta", html: "<h1>B</h1>" },
          ],
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("multi is false");
      const entries = await readdir(p.sessionDir(sessionId));
      expect(entries.filter((e) => e.endsWith(".html"))).toHaveLength(0);
      expect(entries.filter((e) => e.endsWith(".choices.json"))).toHaveLength(0);
      await app.close();
    });
  });

  it("rejects (400) ROOT_SCOPE_REQUIRED when no scope is supplied (X2)", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/alternatives`,
        payload: {
          participant_id: pid,
          id: "ch_noscope",
          question: "Which?",
          multi: false,
          options: [{ id: "a", label: "Alpha", html: "<h1>A</h1>" }],
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("ROOT_SCOPE_REQUIRED");
      /* No bundle written when scope resolution fails before the writer. */
      const entries = await readdir(p.sessionDir(sessionId));
      expect(entries.filter((e) => e.endsWith(".html"))).toHaveLength(0);
      await app.close();
    });
  });
});

describe("POST /sessions/:id/events/choices — option.html refs", () => {
  it("accepts an option.html pointing at an existing bundle", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const htmlRes = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/html`,
        payload: { root, participant_id: pid, html: "<p>hi</p>"  },
      });
      const htmlFilename = htmlRes.json().filename;
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/choices`,
        payload: {
          root,
          participant_id: pid,
          id: "ch_ref",
          question: "Pick?",
          options: [{ id: "a", label: "A", html: htmlFilename }],
          multi: false,
        },
      });
      expect(res.statusCode).toBe(200);
      await app.close();
    });
  });

  it("rejects (400) an option.html that does not exist", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/choices`,
        payload: {
          root,
          participant_id: pid,
          id: "ch_bad",
          question: "Pick?",
          options: [
            { id: "a", label: "A", html: "20260613T120000.000Z_ag-ghost.html" },
          ],
          multi: false,
        },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("rejects (400) a traversal/garbage option.html ref", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/choices`,
        payload: {
          root,
          participant_id: pid,
          id: "ch_bad2",
          question: "Pick?",
          options: [{ id: "a", label: "A", html: "../secret.html" }],
          multi: false,
        },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });
});
