import { describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  applyClaudeHooks,
  detectClaudeHookLocations,
  detectClaudeHooks,
  renderClaudeInstallSnippet,
} from "../../src/hooksInstall/claude.js";
import { withTempProject } from "../helpers/tempdir.js";

describe("Claude hooks adapter", () => {
  it("detects installed when the generic Stop hook is present", () => {
    const settings = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "npx -y f-mark hook auto-stream" }] }],
      },
    };
    const r = detectClaudeHooks(settings);
    expect(r.installed).toBe(true);
    expect(r.detectedEntries.length).toBe(1);
  });

  it("legacy participant-specific hooks are reported as not installed", () => {
    const settings = { hooks: { Stop: [{ hooks: [{ type: "command", command: "npx -y f-mark hook auto-stream ag-claude" }] }] } };
    const r = detectClaudeHooks(settings);
    expect(r.installed).toBe(false);
  });

  it("renders a valid generic snippet with no participant ids", () => {
    const s = renderClaudeInstallSnippet();
    expect(s).not.toContain("ag-claude");
    expect(s).not.toContain("us-1");
    expect(s).not.toContain("UserPromptSubmit");
    expect(s).toContain("Stop");
    expect(s).toContain("npx -y f-mark hook auto-stream");
  });

  it("returns empty detected entries when settings is missing hooks", () => {
    const r = detectClaudeHooks({});
    expect(r.installed).toBe(false);
    expect(r.detectedEntries).toEqual([]);
    expect(r.expectedEntries.length).toBe(1);
  });

  it("returns empty detected entries when settings is null", () => {
    const r = detectClaudeHooks(null as any);
    expect(r.installed).toBe(false);
  });

  it("renders parseable JSON in the snippet", () => {
    const s = renderClaudeInstallSnippet();
    const match = /```json\n([\s\S]+?)\n```/.exec(s);
    expect(match).not.toBeNull();
    const json = match![1]!;
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json) as {
      hooks: {
        Stop: Array<{ hooks: Array<{ type: string; command: string }> }>;
      };
    };
    expect(parsed.hooks.Stop[0]!.hooks[0]!.command).toBe(
      "npx -y f-mark hook auto-stream",
    );
    expect("UserPromptSubmit" in parsed.hooks).toBe(false);
  });

  it("detects project-local and global Claude settings separately", async () => {
    await withTempProject(async (root) => {
      await mkdir(join(root, ".claude"), { recursive: true });
      await writeFile(
        join(root, ".claude", "settings.json"),
        JSON.stringify({
          hooks: {
            Stop: [
              {
                hooks: [
                  {
                    type: "command",
                    command: "npx -y f-mark hook auto-stream",
                  },
                ],
              },
            ],
          },
        }),
        "utf8",
      );

      const r = await detectClaudeHookLocations({
        projectRoot: root,
      });
      const local = r.locations?.find((location) => location.scope === "local");
      const global = r.locations?.find((location) => location.scope === "global");
      expect(local?.configPath).toBe(join(root, ".claude", "settings.json"));
      expect(local?.installed).toBe(true);
      expect(global?.configPath).toContain(".claude/settings.json");
    });
  });

  it("auto-merges Claude hooks without duplicating existing settings", async () => {
    await withTempProject(async (root) => {
      const configPath = join(root, ".claude", "settings.json");
      await mkdir(join(root, ".claude"), { recursive: true });
      await writeFile(
        configPath,
        JSON.stringify({
          theme: "dark",
          hooks: {
            Stop: [
              {
                hooks: [
                  {
                    type: "command",
                    command: "echo existing",
                  },
                  {
                    type: "command",
                    command: "npx -y f-mark hook auto-stream ag-old",
                  },
                ],
              },
            ],
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: "command",
                    command: "npx -y f-mark hook auto-stream us-1 --kind user",
                  },
                ],
              },
            ],
          },
        }),
        "utf8",
      );

      const first = await applyClaudeHooks({
        scope: "local",
        projectRoot: root,
      });
      const second = await applyClaudeHooks({
        scope: "local",
        projectRoot: root,
      });

      const saved = JSON.parse(await readFile(configPath, "utf8"));
      const serializedHooks = JSON.stringify(saved.hooks);
      expect(first.changed).toBe(true);
      expect(second.changed).toBe(false);
      expect(saved.theme).toBe("dark");
      expect(serializedHooks).toContain("echo existing");
      expect(
        serializedHooks.match(/npx -y f-mark hook auto-stream/g)?.length,
      ).toBe(1);
      expect(serializedHooks).not.toContain("ag-old");
      expect(serializedHooks).not.toContain("us-1");
      expect(serializedHooks).not.toContain("--kind user");
    });
  });

  it("uses the nearest parent Claude settings file for local auto-apply", async () => {
    await withTempProject(async (root) => {
      const child = join(root, "nested", "project");
      const configPath = join(root, ".claude", "settings.json");
      await mkdir(child, { recursive: true });
      await mkdir(join(root, ".claude"), { recursive: true });
      await writeFile(configPath, JSON.stringify({ theme: "parent" }), "utf8");

      const applied = await applyClaudeHooks({
        scope: "local",
        projectRoot: child,
      });

      expect(applied.configPath).toBe(configPath);
      const saved = JSON.parse(await readFile(configPath, "utf8"));
      expect(saved.theme).toBe("parent");
      expect(JSON.stringify(saved.hooks)).toContain("npx -y f-mark hook auto-stream");
    });
  });
});
