import { describe, expect, it } from "vitest";
import {
  applyClaude,
  cliFmarkServer,
  detectClaude,
  expectAllFmarkAllowEntries,
  expectClaudeLocation,
  expectProjectFmarkServer,
  expectProjectMcpMissing,
  firstFmarkAllowEntry,
  readClaudeJson,
  readProjectSettingsAllow,
  readUserMcpJson,
  readUserSettingsAllow,
  versionedNodeServer,
  withTempHome,
  writeClaudeJson,
  writeClaudeProjectEnabled,
  writeClaudeProjectPending,
  writeProjectFmarkServer,
  writeProjectLocalFmarkAllowEntries,
  writeProjectLocalSettingsJson,
  writeProjectLocalSettingsRaw,
  writeProjectMcpJson,
  writeUserFmarkAllowEntries,
  writeUserMcpJson,
} from "./claude/helpers.js";

describe("Claude MCP install", () => {
  it("project apply writes .mcp.json and enables fmark in ~/.claude.json", async () => {
    await withTempHome(async (ctx) => {
      const { projectRoot } = ctx;
      await writeClaudeJson(ctx, {
        projects: {
          [projectRoot]: {
            enabledMcpjsonServers: ["other"],
            disabledMcpjsonServers: ["fmark", "legacy"],
          },
        },
      });

      const applied = await applyClaude(ctx, "project");

      expect(applied.changed).toBe(true);
      await expectProjectFmarkServer(ctx);
      const userConfig = await readClaudeJson(ctx);
      expect(
        userConfig.projects[projectRoot].enabledMcpjsonServers,
      ).toContain("fmark");
      expect(
        userConfig.projects[projectRoot].disabledMcpjsonServers,
      ).not.toContain("fmark");

      const detected = await detectClaude(ctx);
      expect(detected.locations[0]?.status).toBe("installed");
    });
  });

  it("project apply removes competing user, local, and legacy fmark definitions", async () => {
    await withTempHome(async (ctx) => {
      const { projectRoot, home } = ctx;
      await writeProjectMcpJson(ctx, {
        mcpServers: {
          fmark: versionedNodeServer("/tmp/old.ts", "/tmp/old-project"),
          "fmark-old": versionedNodeServer(
            "/tmp/alias.ts",
            "/tmp/old-project",
          ),
          unrelated: {
            command: "echo",
            args: ["ok"],
          },
        },
      });
      await writeUserMcpJson(ctx, {
        mcpServers: {
          fmark: versionedNodeServer("/tmp/legacy.ts", home),
          "f-mark": cliFmarkServer(projectRoot),
        },
      });
      await writeClaudeJson(ctx, {
        mcpServers: {
          fmark: versionedNodeServer("/tmp/user.ts", "/tmp/user"),
          "fmark-old": versionedNodeServer("/tmp/user-alias.ts", "/tmp/user"),
        },
        projects: {
          [projectRoot]: {
            mcpServers: {
              fmark: versionedNodeServer("/tmp/local.ts", "/tmp/local"),
              "f-mark": cliFmarkServer(projectRoot),
            },
            enabledMcpjsonServers: ["fmark", "f-mark", "fmark-old", "other"],
            disabledMcpjsonServers: ["f-mark", "fmark-old", "legacy"],
          },
        },
      });

      await applyClaude(ctx, "project");

      const projectConfig = await expectProjectFmarkServer(ctx);
      expect(projectConfig.mcpServers["fmark-old"]).toBeUndefined();
      expect(projectConfig.mcpServers.unrelated).toBeDefined();

      const userConfig = await readClaudeJson(ctx);
      expect(userConfig.mcpServers?.fmark).toBeUndefined();
      expect(userConfig.mcpServers?.["fmark-old"]).toBeUndefined();
      expect(userConfig.projects[projectRoot].mcpServers?.fmark).toBeUndefined();
      expect(
        userConfig.projects[projectRoot].mcpServers?.["f-mark"],
      ).toBeUndefined();
      expect(
        userConfig.projects[projectRoot].enabledMcpjsonServers,
      ).toContain("fmark");
      expect(
        userConfig.projects[projectRoot].enabledMcpjsonServers,
      ).toContain("other");
      expect(
        userConfig.projects[projectRoot].enabledMcpjsonServers,
      ).not.toContain("f-mark");
      expect(
        userConfig.projects[projectRoot].enabledMcpjsonServers,
      ).not.toContain("fmark-old");
      expect(
        userConfig.projects[projectRoot].disabledMcpjsonServers,
      ).toContain("legacy");
      expect(
        userConfig.projects[projectRoot].disabledMcpjsonServers,
      ).not.toContain("f-mark");
      expect(
        userConfig.projects[projectRoot].disabledMcpjsonServers,
      ).not.toContain("fmark-old");

      const legacy = await readUserMcpJson(ctx);
      expect(legacy.mcpServers?.fmark).toBeUndefined();
      expect(legacy.mcpServers?.["f-mark"]).toBeUndefined();

      const detected = await detectClaude(ctx);
      expect(detected.status).toBe("installed");
    });
  });

  it("detect marks a same-version project server stale when it points elsewhere", async () => {
    await withTempHome(async (ctx) => {
      await writeClaudeProjectEnabled(ctx);
      await writeProjectFmarkServer(ctx, "/tmp/not-this-project");
      await writeProjectLocalFmarkAllowEntries(ctx);

      await expectClaudeLocation(ctx, "project", "stale", /project path/);
    });
  });

  it("marks project MCP stale when Claude has not enabled the project server", async () => {
    await withTempHome(async (ctx) => {
      await writeProjectFmarkServer(ctx);

      const detected = await detectClaude(ctx);

      expect(detected.locations[0]?.status).toBe("stale");
      expect(detected.locations[0]?.reason).toMatch(/enabledMcpjsonServers/);
    });
  });

  it("project apply writes every fmark MCP tool to settings.local.json permissions.allow", async () => {
    await withTempHome(async (ctx) => {
      await writeClaudeProjectPending(ctx);

      await applyClaude(ctx, "project");

      const allow = await readProjectSettingsAllow(ctx);
      expect(Array.isArray(allow)).toBe(true);
      expectAllFmarkAllowEntries(allow);
    });
  });

  it("project apply preserves existing permissions.allow entries", async () => {
    await withTempHome(async (ctx) => {
      await writeProjectLocalSettingsJson(ctx, {
        permissions: { allow: ["Bash(ls:*)", "mcp__fmark__fmark_post_prose"] },
      });
      await writeClaudeProjectPending(ctx);

      await applyClaude(ctx, "project");

      const allow = await readProjectSettingsAllow(ctx);
      expect(allow).toContain("Bash(ls:*)");
      /* Idempotent: existing fmark entry not duplicated. */
      const matches = allow.filter(
        (item) => item === "mcp__fmark__fmark_post_prose",
      );
      expect(matches.length).toBe(1);
      expectAllFmarkAllowEntries(allow);
    });
  });

  it("user apply writes permissions.allow to ~/.claude/settings.json", async () => {
    await withTempHome(async (ctx) => {
      await applyClaude(ctx, "user");

      const allow = await readUserSettingsAllow(ctx);
      expectAllFmarkAllowEntries(allow);
    });
  });

  it("detect reports stale when permissions.allow is missing fmark entries", async () => {
    await withTempHome(async (ctx) => {
      await writeClaudeProjectEnabled(ctx);
      await writeProjectFmarkServer(ctx);
      /* No .claude/settings.local.json — permissions.allow is missing. */

      await expectClaudeLocation(ctx, "project", "stale", /permissions\.allow/);
    });
  });

  it("detect treats allow entries in ~/.claude/settings.json as effective for project scope", async () => {
    await withTempHome(async (ctx) => {
      await writeClaudeProjectEnabled(ctx);
      await writeProjectFmarkServer(ctx);
      /* All allow entries live in user-global settings, not .local. */
      await writeUserFmarkAllowEntries(ctx);

      await expectClaudeLocation(ctx, "project", "installed");
    });
  });

  it("detect blocks when a permissions file's top-level JSON is not an object", async () => {
    await withTempHome(async (ctx) => {
      await writeClaudeProjectEnabled(ctx);
      await writeProjectFmarkServer(ctx);
      /* Valid JSON but not an object — should be rejected as invalid. */
      await writeProjectLocalSettingsRaw(ctx, "[]");

      const projectLoc = await expectClaudeLocation(
        ctx,
        "project",
        "blocked",
        /must be a JSON object/,
      );
      expect(projectLoc?.safe_auto_apply).toBe(false);
    });
  });

  it("apply preflight rejects a non-object top-level settings file before mutation", async () => {
    await withTempHome(async (ctx) => {
      await writeProjectLocalSettingsRaw(ctx, "[]");

      await expect(
        applyClaude(ctx, "project"),
      ).rejects.toThrow(/must be a JSON object/);
      await expectProjectMcpMissing(ctx);
    });
  });

  it("detect blocks (and refuses safe auto-apply) when a permissions file is malformed", async () => {
    await withTempHome(async (ctx) => {
      await writeClaudeProjectEnabled(ctx);
      await writeProjectFmarkServer(ctx);
      await writeProjectLocalSettingsRaw(ctx, "{ not valid json");

      const projectLoc = await expectClaudeLocation(
        ctx,
        "project",
        "blocked",
        /invalid JSON/,
      );
      expect(projectLoc?.safe_auto_apply).toBe(false);
    });
  });

  it("apply preflight throws on malformed settings without mutating .mcp.json", async () => {
    await withTempHome(async (ctx) => {
      await writeProjectLocalSettingsRaw(ctx, "{ not valid json");

      await expect(
        applyClaude(ctx, "project"),
      ).rejects.toThrow(/blocked Claude permissions config/);

      /* .mcp.json must NOT exist — we preflight before mutating anything. */
      await expectProjectMcpMissing(ctx);
    });
  });

  it("apply twice is idempotent (changed=false the second time)", async () => {
    await withTempHome(async (ctx) => {
      await writeClaudeProjectPending(ctx);

      const first = await applyClaude(ctx, "project");
      expect(first.changed).toBe(true);

      const second = await applyClaude(ctx, "project");
      expect(second.changed).toBe(false);
    });
  });

  it("apply preserves existing non-fmark allow entries verbatim", async () => {
    await withTempHome(async (ctx) => {
      const existingNonFmark = ["Bash(ls:*)", "Bash(git status:*)", "Read(*.md)"];
      await writeProjectLocalSettingsJson(ctx, {
        permissions: { allow: existingNonFmark },
      });
      await writeClaudeProjectPending(ctx);

      await applyClaude(ctx, "project");

      const allow = await readProjectSettingsAllow(ctx);
      for (const entry of existingNonFmark) {
        expect(allow).toContain(entry);
      }
      /* Order of pre-existing entries is preserved (they appear before
         the freshly added fmark entries because Set iteration is insertion
         order in JS). */
      const firstNonFmarkIndex = allow.indexOf(existingNonFmark[0]!);
      const firstFmarkIndex = allow.indexOf(firstFmarkAllowEntry());
      expect(firstNonFmarkIndex).toBeLessThan(firstFmarkIndex);
    });
  });

  it("local scope apply writes permissions to .claude/settings.local.json", async () => {
    await withTempHome(async (ctx) => {
      await applyClaude(ctx, "local");

      const allow = await readProjectSettingsAllow(ctx);
      expectAllFmarkAllowEntries(allow);

      /* Detect should now report `local` as installed too. */
      await expectClaudeLocation(ctx, "local", "installed");
    });
  });
});
