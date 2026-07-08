import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcileHookScopes } from "../../src/hooksInstall/index.js";
import {
  applyOpencodeHooks,
  opencodePluginPath,
} from "../../src/hooksInstall/opencode.js";
import { autoStreamHookCommand } from "../../src/hooksInstall/command.js";
import { withTempProject } from "../helpers/tempdir.js";

let savedHome: string | undefined;

beforeEach(() => {
  savedHome = process.env.HOME;
});

afterEach(() => {
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
});

describe("reconcileHookScopes", () => {
  it("removes Claude F-Mark hooks from local scope when global is chosen", async () => {
    await withTempProject(async (root) => {
      const configPath = join(root, ".claude", "settings.json");
      await mkdir(join(root, ".claude"), { recursive: true });
      await writeFile(
        configPath,
        JSON.stringify({
          hooks: {
            Stop: [
              {
                hooks: [
                  { type: "command", command: autoStreamHookCommand() },
                  { type: "command", command: "echo keep" },
                ],
              },
            ],
          },
        }),
        "utf8",
      );

      const reconciled = await reconcileHookScopes({
        runtimeId: "claude",
        chosenHookScope: "global",
        projectRoot: root,
      });

      const saved = await readFile(configPath, "utf8");
      expect(reconciled.removed).toEqual([{ scope: "local", configPath }]);
      expect(saved).toContain("echo keep");
      expect(saved).not.toContain("hook auto-stream");
    });
  });

  it("removes OpenCode user hooks when local scope is chosen", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-reconcile-opencode-"));
    try {
      const home = join(root, "home");
      const projectRoot = join(root, "project");
      await mkdir(home, { recursive: true });
      await mkdir(projectRoot, { recursive: true });
      process.env.HOME = home;
      const applied = await applyOpencodeHooks({ scope: "user" });

      const reconciled = await reconcileHookScopes({
        runtimeId: "opencode",
        chosenHookScope: "local",
        projectRoot,
      });

      expect(applied.configPath).toBe(opencodePluginPath("user"));
      expect(reconciled.removed).toEqual([
        { scope: "global", configPath: applied.configPath },
      ]);
      await expect(readFile(applied.configPath, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not reconcile Codex hooks", async () => {
    await expect(
      reconcileHookScopes({
        runtimeId: "codex",
        chosenHookScope: "global",
        projectRoot: "/tmp/fmark-codex-noop",
      }),
    ).resolves.toEqual({ removed: [] });
  });

  it("skips local-scope removal when projectRoot is absent", async () => {
    await expect(
      reconcileHookScopes({
        runtimeId: "claude",
        chosenHookScope: "global",
      }),
    ).resolves.toEqual({ removed: [] });
  });
});
