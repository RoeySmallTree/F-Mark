import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { listParticipants } from "../../src/participants.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { registerProjectPath } from "../../src/paths/registry.js";
import { withTempProject } from "../helpers/tempdir.js";

async function setup(root: string) {
  const p = paths(root);
  await initProject(p);
  const session = await createSession(p, { slug: "x" });
  const [pid] = Object.keys(await listParticipants(p));
  const { app } = createServer({ token: null, paths: p });
  return { p, app, sessionId: session.id, pid: pid! };
}

describe("GET /sessions/:id/raw/:filename", () => {
  it("serves index.html inside an html bundle folder", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const create = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/html`,
        payload: {
          root,
          participant_id: pid,
          html: "<h1>Hello raw</h1>",
          css: "h1 { color: blue; }",
        },
      });
      const folder = create.json().filename;

      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/raw/${folder}/index.html`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/html/);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toBe("sandbox allow-scripts");
      expect(res.headers["content-disposition"]).toBeUndefined();
      expect(res.body).toContain("<!doctype html>");
      expect(res.body).toContain('<style data-fmark-bundle="style.css">');
      expect(res.body).toContain("h1 { color: blue; }");
      expect(res.body).not.toContain('href="./style.css"');
      expect(res.body).toContain("<h1>Hello raw</h1>");

      const cssRes = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/raw/${folder}/style.css`,
      });
      expect(cssRes.statusCode).toBe(200);
      expect(cssRes.headers["content-type"]).toMatch(/css/);
      expect(cssRes.body).toBe("h1 { color: blue; }");
      await app.close();
    });
  });

  it("assembles legacy fragment indexes with companion assets", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const create = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/html`,
        payload: {
          root,
          participant_id: pid,
          html: "<h1>Legacy raw</h1>",
          css: "h1 { color: green; }",
          js: "document.body.dataset.ready = 'true';",
        },
      });
      const folder = create.json().filename;
      await writeFile(
        join(p.sessionDir(sessionId), folder, "index.html"),
        "<h1>Legacy raw</h1>",
      );

      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/raw/${folder}/index.html`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('<style data-fmark-bundle="style.css">');
      expect(res.body).toContain("h1 { color: green; }");
      expect(res.body).toContain('<script data-fmark-bundle="script.js">');
      expect(res.body).toContain("document.body.dataset.ready = 'true';");
      expect(res.body).not.toContain('href="./style.css"');
      expect(res.body).not.toContain('src="./script.js"');
      expect(res.body).toContain("<h1>Legacy raw</h1>");
      await app.close();
    });
  });

  it("rejects path traversal in :filename", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId } = await setup(root);
      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/raw/..%2F..%2F..%2Fetc%2Fpasswd`,
      });
      expect(res.statusCode === 400 || res.statusCode === 404).toBe(true);
      await app.close();
    });
  });

  it("rejects path traversal inside the wildcard segment", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const create = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/html`,
        payload: { root, participant_id: pid, html: "<p>ok</p>"  },
      });
      const folder = create.json().filename;
      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/raw/${folder}/..%2F..%2F..%2Fetc%2Fpasswd`,
      });
      expect(res.statusCode === 400 || res.statusCode === 404).toBe(true);
      await app.close();
    });
  });

  it("returns 404 for unknown files", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId } = await setup(root);
      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/raw/nope.txt`,
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  it("uses the shared MIME table for raw media artifacts", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId } = await setup(root);
      await writeFile(join(p.sessionDir(sessionId), "clip.mp4"), "fake video");

      const res = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/raw/clip.mp4`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/^video\/mp4/);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toBeUndefined();
      expect(res.headers["content-disposition"]).toBeUndefined();
      await app.close();
    });
  });

  it("returns 404 on unknown session", async () => {
    await withTempProject(async (root) => {
      const { app } = await setup(root);
      const res = await app.inject({
        method: "GET",
        url: `/sessions/no-such/raw/anything.html`,
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  it("serves raw files from a scoped background root", async () => {
    await withTempProject(async (activeRoot) => {
      await withTempProject(async (backgroundRoot) => {
        await withTempProject(async (configRoot) => {
          const active = paths(activeRoot);
          const background = paths(backgroundRoot);
          await initProject(active);
          await initProject(background);
          const session = await createSession(background, { slug: "bg" });
          const bundleDir = join(
            background.sessionDir(session.id),
            "report.html",
          );
          await mkdir(bundleDir, { recursive: true });
          await writeFile(join(bundleDir, "index.html"), "<h1>background</h1>");

          const g = globalPaths(configRoot);
          await registerProjectPath(g, backgroundRoot);
          const backgroundPath = activePaths(backgroundRoot);
          const ref = new PathContextRef({
            global: g,
            active: activePaths(activeRoot),
          });
          const { app } = createServer({
            token: null,
            paths: active,
            pathContextRef: ref,
          });

          const unscoped = await app.inject({
            method: "GET",
            url: `/sessions/${session.id}/raw/report.html/index.html`,
          });
          expect(unscoped.statusCode).toBe(404);

          const scoped = await app.inject({
            method: "GET",
            url: `/sessions/${session.id}/raw/report.html/index.html?path_id=${backgroundPath.pathId()}`,
          });
          expect(scoped.statusCode).toBe(200);
          expect(scoped.body).toContain("<h1>background</h1>");
          await app.close();
        });
      });
    });
  });
});
