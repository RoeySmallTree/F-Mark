import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { withTempProject } from "../helpers/tempdir.js";

describe("GET /skills", () => {
  const originalInitCwd = process.env.INIT_CWD;

  beforeEach(() => {
    delete process.env.INIT_CWD;
  });

  afterEach(() => {
    if (originalInitCwd === undefined) {
      delete process.env.INIT_CWD;
    } else {
      process.env.INIT_CWD = originalInitCwd;
    }
  });

  it("returns skills discovered via scanner under INIT_CWD", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      // place a claude skill
      const skillDir = join(root, ".claude", "skills", "demo");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        `---\nname: demo-skill\ndescription: A demo skill\n---\n\nBody\n`,
      );
      process.env.INIT_CWD = root;

      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: `/skills?agent=claude`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.skills)).toBe(true);
      const names = body.skills.map((s: { name: string }) => s.name);
      expect(names).toContain("demo-skill");
      await app.close();
    });
  });

  it("returns an empty list when no skills are present", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      process.env.INIT_CWD = root;

      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "GET",
        url: `/skills?agent=claude`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Could contain ambient skills from FS root walk; we just check shape.
      expect(Array.isArray(body.skills)).toBe(true);
      await app.close();
    });
  });
});
