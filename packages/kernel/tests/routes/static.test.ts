import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { withTempProject } from "../helpers/tempdir.js";

const here = dirname(fileURLToPath(import.meta.url));
const rendererDist = join(here, "..", "..", "..", "renderer", "dist");

const rendererBuilt =
  existsSync(join(rendererDist, "index.html")) &&
  existsSync(join(rendererDist, "assets"));

const sampleAsset = rendererBuilt
  ? readdirSync(join(rendererDist, "assets")).find((f) => f.endsWith(".js"))
  : undefined;

describe.skipIf(!rendererBuilt || sampleAsset === undefined)(
  "static route (against real renderer build)",
  () => {
    it("serves index.html on GET / with a <script type=module> reference", async () => {
      await withTempProject(async (root) => {
        const p = paths(root);
        await initProject(p);
        const { app } = createServer({ token: null, paths: p });
        const res = await app.inject({ method: "GET", url: "/" });
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toMatch(/html/);
        expect(res.body).toMatch(/<script[^>]+type=["']module["']/);
        expect(res.body).toMatch(/<div id="root">/);
        await app.close();
      });
    });

    it("serves /assets/*.js bundles directly (regression: decorateReply/wildcard config)", async () => {
      await withTempProject(async (root) => {
        const p = paths(root);
        await initProject(p);
        const { app } = createServer({ token: null, paths: p });
        const res = await app.inject({
          method: "GET",
          url: `/assets/${sampleAsset}`,
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toMatch(/javascript/);
        expect(res.body.length).toBeGreaterThan(100);
        await app.close();
      });
    });

    it("falls back to index.html on SPA client-side routes", async () => {
      await withTempProject(async (root) => {
        const p = paths(root);
        await initProject(p);
        const { app } = createServer({ token: null, paths: p });
        const res = await app.inject({
          method: "GET",
          url: "/some/spa/route",
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatch(/<div id="root">/);
        await app.close();
      });
    });

    it("returns 404 JSON for unknown API paths", async () => {
      await withTempProject(async (root) => {
        const p = paths(root);
        await initProject(p);
        const { app } = createServer({ token: null, paths: p });
        const res = await app.inject({
          method: "GET",
          url: "/sessions/no-such/events",
        });
        expect(res.statusCode).toBe(404);
        const body = res.json();
        expect(body.error).toMatch(/session/);
        await app.close();
      });
    });
  },
);
