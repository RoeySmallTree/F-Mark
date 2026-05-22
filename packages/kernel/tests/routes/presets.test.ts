import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { withTempProject } from "../helpers/tempdir.js";

async function setup(root: string) {
  const p = paths(root);
  await initProject(p);
  const session = await createSession(p, { slug: "x" });
  const { app } = createServer({ token: null, paths: p });
  return { p, app, sessionId: session.id };
}

describe("GET /presets", () => {
  it("returns the 8 builtin presets", async () => {
    await withTempProject(async (root) => {
      const { app } = await setup(root);
      const res = await app.inject({
        method: "GET",
        url: `/presets`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.builtin)).toBe(true);
      expect(body.builtin).toHaveLength(8);
      expect(body.project).toEqual([]);
      const groups = new Set(body.builtin.map((p: { group: string }) => p.group));
      expect(groups.has("generate")).toBe(true);
      expect(groups.has("critique")).toBe(true);
      expect(groups.has("format")).toBe(true);
      for (const p of body.builtin) {
        expect(p.source).toBe("builtin");
        expect(typeof p.path).toBe("string");
        expect(typeof p.body).toBe("string");
        expect(p.body.length).toBeGreaterThan(0);
      }
      await app.close();
    });
  });

  it("surfaces project presets when session is provided", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId } = await setup(root);
      const projectPresetsDir = join(p.fmarkDir(), "presets");
      await mkdir(projectPresetsDir, { recursive: true });
      await writeFile(
        join(projectPresetsDir, "custom.md"),
        `---
name: My Custom Preset
group: generate
icon: "🎯"
---
Try this custom approach.
`,
      );
      const res = await app.inject({
        method: "GET",
        url: `/presets?session=${sessionId}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.project).toHaveLength(1);
      expect(body.project[0].name).toBe("My Custom Preset");
      expect(body.project[0].group).toBe("generate");
      expect(body.project[0].source).toBe("project");
      expect(body.project[0].body).toBe("Try this custom approach.");
      await app.close();
    });
  });

  it("ignores presets with invalid group", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId } = await setup(root);
      const projectPresetsDir = join(p.fmarkDir(), "presets");
      await mkdir(projectPresetsDir, { recursive: true });
      await writeFile(
        join(projectPresetsDir, "bogus.md"),
        `---
name: Invalid
group: not-a-real-group
---
body
`,
      );
      await writeFile(
        join(projectPresetsDir, "good.md"),
        `---
name: Good
group: format
---
body
`,
      );
      const res = await app.inject({
        method: "GET",
        url: `/presets?session=${sessionId}`,
      });
      const body = res.json();
      expect(body.project).toHaveLength(1);
      expect(body.project[0].name).toBe("Good");
      await app.close();
    });
  });
});
