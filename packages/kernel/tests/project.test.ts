import { describe, it, expect } from "vitest";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { initProject, readConfig, writeConfig } from "../src/project.js";
import { paths } from "../src/paths.js";
import { withTempProject } from "./helpers/tempdir.js";

describe("project", () => {
  it("initProject creates .f-mark dir, config.json, AGENT.md", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const config = JSON.parse(await readFile(p.configFile(), "utf8"));
      expect(config.version).toBe("0.1.0");
      expect(config.port).toBe(7777);
      expect(Object.keys(config.participants)).toHaveLength(1);
      const [id] = Object.keys(config.participants);
      expect(id).toMatch(/^us-[0-9a-f]{4}$/);
      const agent = await readFile(p.agentMd(), "utf8");
      expect(agent.length).toBeGreaterThan(0);
    });
  });

  it("initProject is idempotent: existing config preserved", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await mkdir(p.fmarkDir(), { recursive: true });
      const seed = {
        version: "0.1.0",
        port: 9999,
        participants: { "us-aaaa": { kind: "user", name: "Seed", color: "#000000" } },
      };
      await writeFile(p.configFile(), JSON.stringify(seed));
      await initProject(p);
      const config = JSON.parse(await readFile(p.configFile(), "utf8"));
      expect(config.port).toBe(9999);
      expect(config.participants["us-aaaa"]).toBeDefined();
    });
  });

  it("readConfig + writeConfig round-trip", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const config = await readConfig(p);
      config.port = 8888;
      await writeConfig(p, config);
      const reread = await readConfig(p);
      expect(reread.port).toBe(8888);
    });
  });
});
