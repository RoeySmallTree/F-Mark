import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { globalPaths } from "../../src/paths/global.js";
import { readGlobalConfig, writeGlobalConfig } from "../../src/state/globalConfig.js";
import {
  defaultScope,
  hookInstallScopeFor,
  integrationScopeForHookScope,
  readHookScopePreference,
  readLaunchDefaults,
  resolveChosenScope,
  writeHookScopePreference,
  writeLaunchDefaults,
} from "../../src/mcpInstall/scopePreference.js";

describe("scope preference mapping", () => {
  it("maps integration scopes to hook scopes with Codex normalized to global", () => {
    expect(hookInstallScopeFor("claude", "project")).toBe("local");
    expect(hookInstallScopeFor("claude", "local")).toBe("local");
    expect(hookInstallScopeFor("claude", "user")).toBe("global");
    expect(hookInstallScopeFor("opencode", "project")).toBe("local");
    expect(hookInstallScopeFor("codex", "project")).toBe("global");
    expect(hookInstallScopeFor("codex", "local")).toBe("global");
  });

  it("maps hook scopes back to integration scopes with Codex normalized to user", () => {
    expect(integrationScopeForHookScope("claude", "local")).toBe("project");
    expect(integrationScopeForHookScope("claude", "global")).toBe("user");
    expect(integrationScopeForHookScope("opencode", "local")).toBe("project");
    expect(integrationScopeForHookScope("codex", "local")).toBe("user");
    expect(integrationScopeForHookScope("codex", "global")).toBe("user");
  });

  it("resolves defaults when no preference is persisted", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-scope-default-"));
    try {
      const g = globalPaths(root);
      await expect(resolveChosenScope("claude", g)).resolves.toEqual({
        integrationScope: "project",
        hookScope: "local",
        source: "default",
      });
      await expect(resolveChosenScope("codex", g)).resolves.toEqual({
        integrationScope: "user",
        hookScope: "global",
        source: "default",
      });
      expect(defaultScope("opencode")).toBe("project");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("round-trips hook scope preferences and preserves reserved fields", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-scope-pref-"));
    try {
      const g = globalPaths(root);
      await writeGlobalConfig(g, {
        integrations: {
          claude: {
            model: "sonnet",
            effort: "medium",
            access_mode: "ask",
          },
        },
      });

      await writeHookScopePreference("claude", "global", g);

      await expect(readHookScopePreference("claude", g)).resolves.toBe("global");
      await expect(resolveChosenScope("claude", g)).resolves.toMatchObject({
        integrationScope: "user",
        hookScope: "global",
        source: "preference",
      });
      await expect(readGlobalConfig(g)).resolves.toMatchObject({
        integrations: {
          claude: {
            hook_scope: "global",
            model: "sonnet",
            effort: "medium",
            access_mode: "ask",
          },
        },
      });
      const config = await readGlobalConfig(g);
      expect(config.integrations?.claude?.updated_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("round-trips launch defaults and preserves hook scope", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-launch-pref-"));
    try {
      const g = globalPaths(root);
      await writeGlobalConfig(g, {
        integrations: {
          codex: {
            hook_scope: "global",
          },
        },
      });

      await writeLaunchDefaults(
        "codex",
        {
          model: "gpt-5.2",
          effort: "high",
          access_mode: "never",
        },
        g,
      );

      await expect(readLaunchDefaults("codex", g)).resolves.toEqual({
        model: "gpt-5.2",
        effort: "high",
        access_mode: "never",
      });
      await expect(readGlobalConfig(g)).resolves.toMatchObject({
        integrations: {
          codex: {
            hook_scope: "global",
            model: "gpt-5.2",
            effort: "high",
            access_mode: "never",
          },
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("ignores empty launch default fields instead of storing them", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-launch-empty-"));
    try {
      const g = globalPaths(root);
      await writeLaunchDefaults(
        "claude",
        {
          model: "sonnet",
          effort: "medium",
          access_mode: "plan",
        },
        g,
      );
      await writeLaunchDefaults(
        "claude",
        {
          model: "",
          effort: "",
          access_mode: "",
        },
        g,
      );

      await expect(readLaunchDefaults("claude", g)).resolves.toEqual({
        model: "sonnet",
        effort: "medium",
        access_mode: "plan",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
