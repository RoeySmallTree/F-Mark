import { describe, it, expect } from "vitest";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { withTempProject } from "../helpers/tempdir.js";

describe("routes /participants", () => {
  it("GET /participants returns config participants", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({ method: "GET", url: "/participants" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Object.keys(body.participants).length).toBe(1);
      await app.close();
    });
  });

  it("POST /participants/register creates an agent", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "POST",
        url: "/participants/register",
        payload: { kind: "agent", name: "Claude" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toMatch(/^ag-/);
      await app.close();
    });
  });

  it("POST /participants/register rejects bad payload", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "POST",
        url: "/participants/register",
        payload: { kind: "user" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });
});
