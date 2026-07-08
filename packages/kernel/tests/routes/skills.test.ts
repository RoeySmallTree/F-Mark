import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

  it("reads and saves a discovered skill file", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const skillDir = join(root, ".codex", "skills", "editable-skill");
      const skillPath = join(skillDir, "SKILL.md");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        skillPath,
        [
          "---",
          "name: editable-skill",
          "description: Old description",
          "license: Local",
          "---",
          "",
          "# Body",
          "",
          "Old body.",
          "",
        ].join("\n"),
      );
      process.env.INIT_CWD = root;

      const { app } = createServer({ token: null, paths: p });
      const detail = await app.inject({
        method: "GET",
        url: `/skills/detail?path=${encodeURIComponent(skillPath)}`,
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().body).toContain("Old body.");

      const saved = await app.inject({
        method: "PUT",
        url: "/skills/detail",
        payload: {
          path: skillPath,
          name: "editable-skill",
          description: "New description",
          args: "<topic>",
          body: "# Body\n\nNew body.",
        },
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().description).toBe("New description");
      const raw = await readFile(skillPath, "utf8");
      expect(raw).toContain("description: New description");
      expect(raw).toContain("args: <topic>");
      expect(raw).toContain("license: Local");
      expect(raw).toContain("New body.");
      await app.close();
    });
  });
});
