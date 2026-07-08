import { describe, it, expect } from "vitest";
import { readFile, stat } from "node:fs/promises";
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

describe("POST /sessions/:id/events/html", () => {
  it("writes a folder with manifest, index.html, style.css and script.js", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/html`,
        payload: {
          root,
          participant_id: pid,
          html: "<h1>Hello</h1>",
          css: "h1 { color: red; }",
          js: "console.log('hi')",
          title: "Demo",
          dependencies: ["chart.js"],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.filename).toMatch(/\.html$/);
      expect(body.kind).toBe("html");

      const folderPath = join(p.sessionDir(sessionId), body.filename);
      const s = await stat(folderPath);
      expect(s.isDirectory()).toBe(true);

      const manifest = JSON.parse(
        await readFile(join(folderPath, "manifest.json"), "utf8"),
      );
      expect(manifest.title).toBe("Demo");
      expect(manifest.dependencies).toEqual(["chart.js"]);
      expect(manifest.id).toBe(body.filename.replace(/\.html$/, ""));

      const indexHtml = await readFile(
        join(folderPath, "index.html"),
        "utf8",
      );
      expect(indexHtml).toContain("<!doctype html>");
      expect(indexHtml).toContain('<style data-fmark-bundle="style.css">');
      expect(indexHtml).toContain("h1 { color: red; }");
      expect(indexHtml).toContain('<script data-fmark-bundle="script.js">');
      expect(indexHtml).toContain("console.log('hi')");
      expect(indexHtml).not.toContain('href="./style.css"');
      expect(indexHtml).not.toContain('src="./script.js"');
      expect(indexHtml).toContain("<h1>Hello</h1>");

      const css = await readFile(join(folderPath, "style.css"), "utf8");
      expect(css).toBe("h1 { color: red; }");
      const js = await readFile(join(folderPath, "script.js"), "utf8");
      expect(js).toBe("console.log('hi')");
      await app.close();
    });
  });

  it("injects bundle assets into full HTML documents", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/html`,
        payload: {
          root,
          participant_id: pid,
          html: "<!doctype html><html><head><title>X</title></head><body><main>Demo</main></body></html>",
          css: "main { color: red; }",
          js: "document.body.dataset.ready = 'true';",
        },
      });
      expect(res.statusCode).toBe(200);
      const folder = join(p.sessionDir(sessionId), res.json().filename);
      const indexHtml = await readFile(join(folder, "index.html"), "utf8");
      expect(indexHtml).toContain("<title>X</title>");
      expect(indexHtml).toContain('<style data-fmark-bundle="style.css">');
      expect(indexHtml).toContain("main { color: red; }");
      expect(indexHtml).toContain('<script data-fmark-bundle="script.js">');
      expect(indexHtml).toContain("document.body.dataset.ready = 'true';");
      expect(indexHtml).not.toContain('href="./style.css"');
      expect(indexHtml).not.toContain('src="./script.js"');
      expect(indexHtml).toContain("<body><main>Demo</main>");
      expect(indexHtml).toContain("</script>\n</body>");
      await app.close();
    });
  });

  it("removes companion asset tags before inlining css and js", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/html`,
        payload: {
          root,
          participant_id: pid,
          html: '<!doctype html><html><head><link rel="stylesheet" href="./style.css"></head><body><main>Demo</main><script src="./script.js"></script></body></html>',
          css: "main { color: red; }",
          js: "document.body.dataset.ready = 'true';",
        },
      });
      expect(res.statusCode).toBe(200);
      const folder = join(p.sessionDir(sessionId), res.json().filename);
      const indexHtml = await readFile(join(folder, "index.html"), "utf8");
      expect(indexHtml).toContain('<style data-fmark-bundle="style.css">');
      expect(indexHtml).toContain('<script data-fmark-bundle="script.js">');
      expect(indexHtml).not.toContain('href="./style.css"');
      expect(indexHtml).not.toContain('src="./script.js"');
      await app.close();
    });
  });

  it("returns 400 on missing required html", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/html`,
        payload: { root, participant_id: pid  },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("returns 404 on missing session", async () => {
    await withTempProject(async (root) => {
      const { app, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/no-such/events/html`,
        payload: { root, participant_id: pid, html: "<p/>"  },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  it("works without optional css/js", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/html`,
        payload: { root, participant_id: pid, html: "<p>hi</p>"  },
      });
      expect(res.statusCode).toBe(200);
      const folder = join(p.sessionDir(sessionId), res.json().filename);
      const manifest = JSON.parse(
        await readFile(join(folder, "manifest.json"), "utf8"),
      );
      expect(manifest.id).toBeTruthy();
      await app.close();
    });
  });
});
