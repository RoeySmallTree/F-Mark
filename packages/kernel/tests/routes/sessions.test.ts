import { describe, it, expect } from "vitest";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { withTempProject } from "../helpers/tempdir.js";

describe("routes /sessions", () => {
  it("POST /sessions creates a session", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "POST",
        url: "/sessions",
        payload: { slug: "demo" },
      });
      expect(res.statusCode).toBe(200);
      const meta = res.json();
      expect(meta.id).toMatch(/-demo$/);
      await app.close();
    });
  });

  it("GET /sessions lists sessions", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      await app.inject({ method: "POST", url: "/sessions", payload: { slug: "a" } });
      await app.inject({ method: "POST", url: "/sessions", payload: { slug: "b" } });
      const res = await app.inject({ method: "GET", url: "/sessions" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessions.length).toBe(2);
      await app.close();
    });
  });

  it("requires bearer token when configured", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: "secret", paths: p });
      const res = await app.inject({ method: "GET", url: "/sessions" });
      expect(res.statusCode).toBe(401);
      const ok = await app.inject({
        method: "GET",
        url: "/sessions",
        headers: { authorization: "Bearer secret" },
      });
      expect(ok.statusCode).toBe(200);
      await app.close();
    });
  });
});
