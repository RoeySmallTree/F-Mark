import { describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  applyClaudeHooks,
  detectClaudeHookLocations,
  detectClaudeHooks,
  removeClaudeFmarkHooks,
  renderClaudeInstallSnippet,
} from "../../src/hooksInstall/claude.js";
import { autoStreamHookCommand } from "../../src/hooksInstall/command.js";
import { withTempProject } from "../helpers/tempdir.js";

describe("Claude hooks adapter", () => {
  it("detects installed when the generic live-stream hooks are present", () => {
    const command = autoStreamHookCommand();
    const settings = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command }] }],
        PermissionRequest: [{ hooks: [{ type: "command", command }] }],
        PostToolUse: [{ hooks: [{ type: "command", command }] }],
        MessageDisplay: [{ hooks: [{ type: "command", command }] }],
      },
    };
    const r = detectClaudeHooks(settings);
    expect(r.installed).toBe(true);
    expect(r.status).toBe("installed");
    expect(r.detectedEntries.length).toBe(4);
    expect(r.detectedEntries.every((entry) => entry.version !== null)).toBe(true);
  });

  it("reports stale when MessageDisplay hook is missing (v2 install upgraded to v3)", () => {
    const command = autoStreamHookCommand();
    const settings = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command }] }],
        PermissionRequest: [{ hooks: [{ type: "command", command }] }],
        PostToolUse: [{ hooks: [{ type: "command", command }] }],
        /* No MessageDisplay — v2 layout. */
      },
    };
    const r = detectClaudeHooks(settings);
    expect(r.installed).toBe(false);
    expect(r.status).toBe("stale");
    expect(r.detectedEntries.length).toBe(3);
    expect(r.expectedEntries.length).toBe(4);
  });

  it("legacy participant-specific hooks are reported as stale", () => {
    const settings = { hooks: { Stop: [{ hooks: [{ type: "command", command: "npx -y f-mark hook auto-stream ag-claude" }] }] } };
    const r = detectClaudeHooks(settings);
    expect(r.installed).toBe(false);
    expect(r.status).toBe("stale");
    expect(r.detectedEntries).toHaveLength(1);
    expect(r.detectedVersion).toBeNull();
  });

  it("renders a valid generic snippet with no participant ids", () => {
    const s = renderClaudeInstallSnippet();
    expect(s).not.toContain("ag-claude");
    expect(s).not.toContain("us-1");
    expect(s).not.toContain("UserPromptSubmit");
    expect(s).toContain("Stop");
    expect(s).toContain("MessageDisplay");
    expect(s).toContain("hook auto-stream");
    expect(s).not.toContain("npx -y f-mark");
  });

  it("returns empty detected entries when settings is missing hooks", () => {
    const r = detectClaudeHooks({});
    expect(r.installed).toBe(false);
    expect(r.status).toBe("missing");
    expect(r.detectedEntries).toEqual([]);
    expect(r.expectedEntries.length).toBe(4);
  });

  it("returns empty detected entries when settings is null", () => {
    const r = detectClaudeHooks(null as any);
    expect(r.installed).toBe(false);
  });

  it("renders parseable JSON in the snippet that includes live hooks", () => {
    const s = renderClaudeInstallSnippet();
    const match = /```json\n([\s\S]+?)\n```/.exec(s);
    expect(match).not.toBeNull();
    const json = match![1]!;
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json) as {
      hooks: {
        Stop: Array<{ hooks: Array<{ type: string; command: string }> }>;
        PermissionRequest: Array<{ hooks: Array<{ type: string; command: string }> }>;
        PostToolUse: Array<{ hooks: Array<{ type: string; command: string }> }>;
        MessageDisplay: Array<{ hooks: Array<{ type: string; command: string }> }>;
      };
    };
    expect(parsed.hooks.Stop[0]!.hooks[0]!.command).toBe(autoStreamHookCommand());
    expect(parsed.hooks.PermissionRequest[0]!.hooks[0]!.command).toBe(
      autoStreamHookCommand(),
    );
    expect(parsed.hooks.PostToolUse[0]!.hooks[0]!.command).toBe(
      autoStreamHookCommand(),
    );
    expect(parsed.hooks.MessageDisplay[0]!.hooks[0]!.command).toBe(
      autoStreamHookCommand(),
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
                    command: autoStreamHookCommand(),
                  },
                ],
              },
            ],
            PermissionRequest: [
              {
                hooks: [
                  {
                    type: "command",
                    command: autoStreamHookCommand(),
                  },
                ],
              },
            ],
            PostToolUse: [
              {
                hooks: [
                  {
                    type: "command",
                    command: autoStreamHookCommand(),
                  },
                ],
              },
            ],
            MessageDisplay: [
              {
                hooks: [
                  {
                    type: "command",
                    command: autoStreamHookCommand(),
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
      /* Four F-Mark hooks now: Stop, PermissionRequest, PostToolUse, MessageDisplay. */
      expect(
        serializedHooks.match(/hook auto-stream/g)?.length,
      ).toBe(4);
      expect(serializedHooks).not.toContain("npx -y f-mark");
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
      expect(JSON.stringify(saved.hooks)).toContain("hook auto-stream");
      expect(JSON.stringify(saved.hooks)).not.toContain("npx -y f-mark");
    });
  });

  it("removes all F-Mark hooks while preserving non-F-Mark hooks", async () => {
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
                  { type: "command", command: autoStreamHookCommand() },
                  { type: "command", command: "echo keep-stop" },
                ],
              },
            ],
            PermissionRequest: [
              {
                hooks: [
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
                    command: "f-mark hook auto-stream us-old --kind user",
                  },
                ],
              },
            ],
            OtherEvent: [
              {
                hooks: [
                  { type: "command", command: "f-mark hook auto-stream ag-other" },
                ],
              },
            ],
          },
        }),
        "utf8",
      );

      const removed = await removeClaudeFmarkHooks({
        scope: "local",
        projectRoot: root,
      });

      const saved = JSON.parse(await readFile(configPath, "utf8"));
      expect(removed).toEqual({ configPath, changed: true });
      expect(saved.theme).toBe("dark");
      expect(saved.hooks.Stop).toEqual([
        { hooks: [{ type: "command", command: "echo keep-stop" }] },
      ]);
      expect(saved.hooks.PermissionRequest).toBeUndefined();
      expect(saved.hooks.UserPromptSubmit).toBeUndefined();
      expect(saved.hooks.OtherEvent).toBeUndefined();
      expect(JSON.stringify(saved)).not.toContain("hook auto-stream");
    });
  });

  it("remove is a no-op when the settings file is missing", async () => {
    await withTempProject(async (root) => {
      const removed = await removeClaudeFmarkHooks({
        scope: "local",
        projectRoot: root,
      });

      expect(removed).toEqual({
        configPath: join(root, ".claude", "settings.json"),
        changed: false,
      });
    });
  });
});
