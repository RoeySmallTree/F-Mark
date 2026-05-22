import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findSkills } from "../../src/skills/scanner.js";
import { withTempProject } from "../helpers/tempdir.js";

async function placeSkill(
  baseDir: string,
  agentFolder: string,
  skillName: string,
  frontmatter: Record<string, string>,
  body: string = "Body",
): Promise<void> {
  // agentFolder is a dotfolder name like ".claude"; pass "" to use ".skills".
  const folder = agentFolder.length > 0 ? agentFolder : ".skills";
  const dir =
    agentFolder.length > 0
      ? join(baseDir, folder, "skills", skillName)
      : join(baseDir, folder, skillName);
  await mkdir(dir, { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  await writeFile(join(dir, "SKILL.md"), `---\n${fm}\n---\n\n${body}\n`);
}

describe("findSkills", () => {
  it("finds skills under .{agent}/skills and .skills, walking upward", async () => {
    await withTempProject(async (root) => {
      // Layout: root/parent/.skills/bar/SKILL.md and root/parent/child/.claude/skills/foo/SKILL.md
      const child = join(root, "parent", "child");
      await mkdir(child, { recursive: true });
      await placeSkill(child, ".claude", "foo", {
        name: "foo-skill",
        description: "Foo skill",
      });
      await placeSkill(join(root, "parent"), "", "bar", {
        name: "bar-skill",
        description: "Bar skill",
      });

      const skills = await findSkills(child);
      const names = skills.map((s) => s.name).sort();
      expect(names).toContain("foo-skill");
      expect(names).toContain("bar-skill");
      const foo = skills.find((s) => s.name === "foo-skill")!;
      expect(foo.agent).toBe("claude");
      expect(foo.description).toBe("Foo skill");
      expect(foo.path.endsWith("SKILL.md")).toBe(true);
      const bar = skills.find((s) => s.name === "bar-skill")!;
      expect(bar.agent).toBe("generic");
    });
  });

  it("closer-to-cwd skill wins on name dupe", async () => {
    await withTempProject(async (root) => {
      const child = join(root, "child");
      await mkdir(child, { recursive: true });
      // Distant: parent has a skill named "dup"
      await placeSkill(root, ".claude", "dup", {
        name: "dup",
        description: "Far",
      });
      // Close: child has the same name
      await placeSkill(child, ".claude", "dup", {
        name: "dup",
        description: "Near",
      });
      const skills = await findSkills(child);
      const dup = skills.find((s) => s.name === "dup")!;
      expect(dup.description).toBe("Near");
    });
  });

  it("agent filter narrows results to that agent + generic .skills", async () => {
    await withTempProject(async (root) => {
      await placeSkill(root, ".claude", "claude-only", {
        name: "claude-only",
        description: "c",
      });
      await placeSkill(root, ".codex", "codex-only", {
        name: "codex-only",
        description: "x",
      });
      await placeSkill(root, "", "everyone", {
        name: "everyone",
        description: "g",
      });
      const claudeSkills = await findSkills(root, "claude");
      const names = claudeSkills.map((s) => s.name).sort();
      expect(names).toContain("claude-only");
      expect(names).toContain("everyone");
      expect(names).not.toContain("codex-only");
    });
  });

  it("skips entries missing SKILL.md", async () => {
    await withTempProject(async (root) => {
      await mkdir(join(root, ".claude", "skills", "empty"), {
        recursive: true,
      });
      await placeSkill(root, ".claude", "good", {
        name: "good",
        description: "real",
      });
      const skills = await findSkills(root);
      expect(skills.find((s) => s.name === "empty")).toBeUndefined();
      expect(skills.find((s) => s.name === "good")).toBeDefined();
    });
  });

  it("uses folder name when frontmatter name absent", async () => {
    await withTempProject(async (root) => {
      const skillsDir = join(root, ".claude", "skills", "from-folder");
      await mkdir(skillsDir, { recursive: true });
      await writeFile(
        join(skillsDir, "SKILL.md"),
        `---\ndescription: From folder\n---\n\nBody\n`,
      );
      const skills = await findSkills(root);
      expect(skills.find((s) => s.name === "from-folder")).toBeDefined();
    });
  });

  it("parses args field from frontmatter", async () => {
    await withTempProject(async (root) => {
      await placeSkill(root, ".claude", "with-args", {
        name: "with-args",
        description: "Has args",
        args: '"<query>"',
      });
      const skills = await findSkills(root);
      const found = skills.find((s) => s.name === "with-args")!;
      expect(found.args).toBe("<query>");
    });
  });
});
