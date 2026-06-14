import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyClaudeMcp, detectClaudeMcp } from "../../src/mcpInstall/claude.js";
import { FMARK_MCP_INSTALL_VERSION } from "../../src/mcpInstall/types.js";
import { FMARK_CLAUDE_ALLOW_ENTRIES } from "../../src/mcp/tools.js";

async function withTempHome(
  fn: (ctx: { projectRoot: string; home: string }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "fmark-claude-mcp-"));
  const projectRoot = join(root, "project");
  const home = join(root, "home");
  try {
    await mkdir(projectRoot, { recursive: true });
    await mkdir(home, { recursive: true });
    await fn({ projectRoot, home });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("Claude MCP install", () => {
  it("project apply writes .mcp.json and enables fmark in ~/.claude.json", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      const claudeJson = join(home, ".claude.json");
      await writeFile(
        claudeJson,
        JSON.stringify({
          projects: {
            [projectRoot]: {
              enabledMcpjsonServers: ["other"],
              disabledMcpjsonServers: ["fmark", "legacy"],
            },
          },
        }),
      );
      const env = {
        HOME: home,
        F_MARK_MCP_COMMAND: "fmark-dev",
        F_MARK_MCP_ARGS: '["mcp"]',
      };

      const applied = await applyClaudeMcp({
        runtimeId: "claude",
        scope: "project",
        projectRoot,
        env,
      });

      expect(applied.changed).toBe(true);
      const projectConfig = JSON.parse(
        await readFile(join(projectRoot, ".mcp.json"), "utf8"),
      );
      expect(projectConfig.mcpServers.fmark.command).toBe("fmark-dev");
      expect(projectConfig.mcpServers.fmark.args).toEqual([
        "mcp",
        "--path",
        projectRoot,
      ]);
      const userConfig = JSON.parse(await readFile(claudeJson, "utf8"));
      expect(
        userConfig.projects[projectRoot].enabledMcpjsonServers,
      ).toContain("fmark");
      expect(
        userConfig.projects[projectRoot].disabledMcpjsonServers,
      ).not.toContain("fmark");

      const detected = await detectClaudeMcp({
        runtimeId: "claude",
        projectRoot,
        env,
      });
      expect(detected.locations[0]?.status).toBe("installed");
    });
  });

  it("project apply removes competing user, local, and legacy fmark definitions", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      const env = {
        HOME: home,
        F_MARK_MCP_COMMAND: "fmark-dev",
        F_MARK_MCP_ARGS: '["mcp"]',
      };
      await writeFile(
        join(projectRoot, ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            fmark: {
              command: "node",
              args: ["/tmp/old.ts", "mcp", "--path", "/tmp/old-project"],
              env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
            },
          },
        }),
      );
      await writeFile(
        join(home, ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            fmark: {
              command: "node",
              args: ["/tmp/legacy.ts", "mcp", "--path", home],
              env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
            },
          },
        }),
      );
      await writeFile(
        join(home, ".claude.json"),
        JSON.stringify({
          mcpServers: {
            fmark: {
              command: "node",
              args: ["/tmp/user.ts", "mcp", "--path", "/tmp/user"],
              env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
            },
          },
          projects: {
            [projectRoot]: {
              mcpServers: {
                fmark: {
                  command: "node",
                  args: ["/tmp/local.ts", "mcp", "--path", "/tmp/local"],
                  env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
                },
              },
              enabledMcpjsonServers: ["fmark"],
            },
          },
        }),
      );

      await applyClaudeMcp({
        runtimeId: "claude",
        scope: "project",
        projectRoot,
        env,
      });

      const projectConfig = JSON.parse(
        await readFile(join(projectRoot, ".mcp.json"), "utf8"),
      );
      expect(projectConfig.mcpServers.fmark.command).toBe("fmark-dev");
      expect(projectConfig.mcpServers.fmark.args).toEqual([
        "mcp",
        "--path",
        projectRoot,
      ]);

      const userConfig = JSON.parse(await readFile(join(home, ".claude.json"), "utf8"));
      expect(userConfig.mcpServers?.fmark).toBeUndefined();
      expect(userConfig.projects[projectRoot].mcpServers?.fmark).toBeUndefined();
      expect(userConfig.projects[projectRoot].enabledMcpjsonServers).toContain("fmark");

      const legacy = JSON.parse(await readFile(join(home, ".mcp.json"), "utf8"));
      expect(legacy.mcpServers?.fmark).toBeUndefined();

      const detected = await detectClaudeMcp({
        runtimeId: "claude",
        projectRoot,
        env,
      });
      expect(detected.status).toBe("installed");
    });
  });

  it("detect marks a same-version project server stale when it points elsewhere", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      await writeFile(
        join(home, ".claude.json"),
        JSON.stringify({
          projects: {
            [projectRoot]: { enabledMcpjsonServers: ["fmark"] },
          },
        }),
      );
      await writeFile(
        join(projectRoot, ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            fmark: {
              command: "fmark-dev",
              args: ["mcp", "--path", "/tmp/not-this-project"],
              env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
            },
          },
        }),
      );
      await mkdir(join(projectRoot, ".claude"), { recursive: true });
      await writeFile(
        join(projectRoot, ".claude", "settings.local.json"),
        JSON.stringify({
          permissions: { allow: [...FMARK_CLAUDE_ALLOW_ENTRIES] },
        }),
      );

      const detected = await detectClaudeMcp({
        runtimeId: "claude",
        projectRoot,
        env: {
          HOME: home,
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });

      const projectLoc = detected.locations.find((loc) => loc.scope === "project");
      expect(projectLoc?.status).toBe("stale");
      expect(projectLoc?.reason).toMatch(/project path/);
    });
  });

  it("marks project MCP stale when Claude has not enabled the project server", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      await writeFile(
        join(projectRoot, ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            fmark: {
              command: "fmark-dev",
              args: ["mcp", "--path", projectRoot],
              env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
            },
          },
        }),
      );

      const detected = await detectClaudeMcp({
        runtimeId: "claude",
        projectRoot,
        env: {
          HOME: home,
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });

      expect(detected.locations[0]?.status).toBe("stale");
      expect(detected.locations[0]?.reason).toMatch(/enabledMcpjsonServers/);
    });
  });

  it("project apply writes every fmark MCP tool to settings.local.json permissions.allow", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      await writeFile(
        join(home, ".claude.json"),
        JSON.stringify({
          projects: { [projectRoot]: { enabledMcpjsonServers: [] } },
        }),
      );
      const env = {
        HOME: home,
        F_MARK_MCP_COMMAND: "fmark-dev",
        F_MARK_MCP_ARGS: '["mcp"]',
      };

      await applyClaudeMcp({
        runtimeId: "claude",
        scope: "project",
        projectRoot,
        env,
      });

      const settings = JSON.parse(
        await readFile(join(projectRoot, ".claude", "settings.local.json"), "utf8"),
      );
      const allow = settings.permissions?.allow;
      expect(Array.isArray(allow)).toBe(true);
      for (const entry of FMARK_CLAUDE_ALLOW_ENTRIES) {
        expect(allow).toContain(entry);
      }
    });
  });

  it("project apply preserves existing permissions.allow entries", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      const settingsPath = join(projectRoot, ".claude", "settings.local.json");
      await mkdir(join(projectRoot, ".claude"), { recursive: true });
      await writeFile(
        settingsPath,
        JSON.stringify({
          permissions: { allow: ["Bash(ls:*)", "mcp__fmark__fmark_post_prose"] },
        }),
      );
      await writeFile(
        join(home, ".claude.json"),
        JSON.stringify({
          projects: { [projectRoot]: { enabledMcpjsonServers: [] } },
        }),
      );
      const env = {
        HOME: home,
        F_MARK_MCP_COMMAND: "fmark-dev",
        F_MARK_MCP_ARGS: '["mcp"]',
      };

      await applyClaudeMcp({
        runtimeId: "claude",
        scope: "project",
        projectRoot,
        env,
      });

      const settings = JSON.parse(await readFile(settingsPath, "utf8"));
      const allow = settings.permissions.allow as string[];
      expect(allow).toContain("Bash(ls:*)");
      /* Idempotent: existing fmark entry not duplicated. */
      const matches = allow.filter((item) => item === "mcp__fmark__fmark_post_prose");
      expect(matches.length).toBe(1);
      for (const entry of FMARK_CLAUDE_ALLOW_ENTRIES) {
        expect(allow).toContain(entry);
      }
    });
  });

  it("user apply writes permissions.allow to ~/.claude/settings.json", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      const env = {
        HOME: home,
        F_MARK_MCP_COMMAND: "fmark-dev",
        F_MARK_MCP_ARGS: '["mcp"]',
      };

      await applyClaudeMcp({
        runtimeId: "claude",
        scope: "user",
        projectRoot,
        env,
      });

      const settings = JSON.parse(
        await readFile(join(home, ".claude", "settings.json"), "utf8"),
      );
      const allow = settings.permissions.allow as string[];
      for (const entry of FMARK_CLAUDE_ALLOW_ENTRIES) {
        expect(allow).toContain(entry);
      }
    });
  });

  it("detect reports stale when permissions.allow is missing fmark entries", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      const claudeJson = join(home, ".claude.json");
      await writeFile(
        claudeJson,
        JSON.stringify({
          projects: {
            [projectRoot]: { enabledMcpjsonServers: ["fmark"] },
          },
        }),
      );
      await writeFile(
        join(projectRoot, ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            fmark: {
              command: "fmark-dev",
              args: ["mcp", "--path", projectRoot],
              env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
            },
          },
        }),
      );
      /* No .claude/settings.local.json — permissions.allow is missing. */

      const detected = await detectClaudeMcp({
        runtimeId: "claude",
        projectRoot,
        env: {
          HOME: home,
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });

      const projectLoc = detected.locations.find((loc) => loc.scope === "project");
      expect(projectLoc?.status).toBe("stale");
      expect(projectLoc?.reason).toMatch(/permissions\.allow/);
    });
  });

  it("detect treats allow entries in ~/.claude/settings.json as effective for project scope", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      await writeFile(
        join(home, ".claude.json"),
        JSON.stringify({
          projects: {
            [projectRoot]: { enabledMcpjsonServers: ["fmark"] },
          },
        }),
      );
      await writeFile(
        join(projectRoot, ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            fmark: {
              command: "fmark-dev",
              args: ["mcp", "--path", projectRoot],
              env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
            },
          },
        }),
      );
      /* All allow entries live in user-global settings, not .local. */
      await mkdir(join(home, ".claude"), { recursive: true });
      await writeFile(
        join(home, ".claude", "settings.json"),
        JSON.stringify({
          permissions: { allow: [...FMARK_CLAUDE_ALLOW_ENTRIES] },
        }),
      );

      const detected = await detectClaudeMcp({
        runtimeId: "claude",
        projectRoot,
        env: {
          HOME: home,
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });

      const projectLoc = detected.locations.find((loc) => loc.scope === "project");
      expect(projectLoc?.status).toBe("installed");
    });
  });

  it("detect blocks when a permissions file's top-level JSON is not an object", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      await writeFile(
        join(home, ".claude.json"),
        JSON.stringify({
          projects: {
            [projectRoot]: { enabledMcpjsonServers: ["fmark"] },
          },
        }),
      );
      await writeFile(
        join(projectRoot, ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            fmark: {
              command: "fmark-dev",
              args: ["mcp", "--path", projectRoot],
              env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
            },
          },
        }),
      );
      await mkdir(join(projectRoot, ".claude"), { recursive: true });
      /* Valid JSON but not an object — should be rejected as invalid. */
      await writeFile(
        join(projectRoot, ".claude", "settings.local.json"),
        "[]",
      );

      const detected = await detectClaudeMcp({
        runtimeId: "claude",
        projectRoot,
        env: {
          HOME: home,
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });

      const projectLoc = detected.locations.find((loc) => loc.scope === "project");
      expect(projectLoc?.status).toBe("blocked");
      expect(projectLoc?.safe_auto_apply).toBe(false);
      expect(projectLoc?.reason).toMatch(/must be a JSON object/);
    });
  });

  it("apply preflight rejects a non-object top-level settings file before mutation", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      const env = {
        HOME: home,
        F_MARK_MCP_COMMAND: "fmark-dev",
        F_MARK_MCP_ARGS: '["mcp"]',
      };
      await mkdir(join(projectRoot, ".claude"), { recursive: true });
      await writeFile(
        join(projectRoot, ".claude", "settings.local.json"),
        "[]",
      );

      await expect(
        applyClaudeMcp({
          runtimeId: "claude",
          scope: "project",
          projectRoot,
          env,
        }),
      ).rejects.toThrow(/must be a JSON object/);
      await expect(
        readFile(join(projectRoot, ".mcp.json"), "utf8"),
      ).rejects.toThrow();
    });
  });

  it("detect blocks (and refuses safe auto-apply) when a permissions file is malformed", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      await writeFile(
        join(home, ".claude.json"),
        JSON.stringify({
          projects: {
            [projectRoot]: { enabledMcpjsonServers: ["fmark"] },
          },
        }),
      );
      await writeFile(
        join(projectRoot, ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            fmark: {
              command: "fmark-dev",
              args: ["mcp", "--path", projectRoot],
              env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
            },
          },
        }),
      );
      await mkdir(join(projectRoot, ".claude"), { recursive: true });
      await writeFile(
        join(projectRoot, ".claude", "settings.local.json"),
        "{ not valid json",
      );

      const detected = await detectClaudeMcp({
        runtimeId: "claude",
        projectRoot,
        env: {
          HOME: home,
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });

      const projectLoc = detected.locations.find((loc) => loc.scope === "project");
      expect(projectLoc?.status).toBe("blocked");
      expect(projectLoc?.safe_auto_apply).toBe(false);
      expect(projectLoc?.reason).toMatch(/invalid JSON/);
    });
  });

  it("apply preflight throws on malformed settings without mutating .mcp.json", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      const env = {
        HOME: home,
        F_MARK_MCP_COMMAND: "fmark-dev",
        F_MARK_MCP_ARGS: '["mcp"]',
      };
      await mkdir(join(projectRoot, ".claude"), { recursive: true });
      await writeFile(
        join(projectRoot, ".claude", "settings.local.json"),
        "{ not valid json",
      );

      await expect(
        applyClaudeMcp({
          runtimeId: "claude",
          scope: "project",
          projectRoot,
          env,
        }),
      ).rejects.toThrow(/blocked Claude permissions config/);

      /* .mcp.json must NOT exist — we preflight before mutating anything. */
      await expect(
        readFile(join(projectRoot, ".mcp.json"), "utf8"),
      ).rejects.toThrow();
    });
  });

  it("apply twice is idempotent (changed=false the second time)", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      await writeFile(
        join(home, ".claude.json"),
        JSON.stringify({
          projects: { [projectRoot]: { enabledMcpjsonServers: [] } },
        }),
      );
      const env = {
        HOME: home,
        F_MARK_MCP_COMMAND: "fmark-dev",
        F_MARK_MCP_ARGS: '["mcp"]',
      };
      const first = await applyClaudeMcp({
        runtimeId: "claude",
        scope: "project",
        projectRoot,
        env,
      });
      expect(first.changed).toBe(true);

      const second = await applyClaudeMcp({
        runtimeId: "claude",
        scope: "project",
        projectRoot,
        env,
      });
      expect(second.changed).toBe(false);
    });
  });

  it("apply preserves existing non-fmark allow entries verbatim", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      const settingsPath = join(projectRoot, ".claude", "settings.local.json");
      await mkdir(join(projectRoot, ".claude"), { recursive: true });
      const existingNonFmark = ["Bash(ls:*)", "Bash(git status:*)", "Read(*.md)"];
      await writeFile(
        settingsPath,
        JSON.stringify({ permissions: { allow: existingNonFmark } }),
      );
      await writeFile(
        join(home, ".claude.json"),
        JSON.stringify({
          projects: { [projectRoot]: { enabledMcpjsonServers: [] } },
        }),
      );

      await applyClaudeMcp({
        runtimeId: "claude",
        scope: "project",
        projectRoot,
        env: {
          HOME: home,
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });

      const settings = JSON.parse(await readFile(settingsPath, "utf8"));
      const allow = settings.permissions.allow as string[];
      for (const entry of existingNonFmark) {
        expect(allow).toContain(entry);
      }
      /* Order of pre-existing entries is preserved (they appear before
         the freshly added fmark entries because Set iteration is insertion
         order in JS). */
      const firstNonFmarkIndex = allow.indexOf(existingNonFmark[0]!);
      const firstFmarkIndex = allow.indexOf(FMARK_CLAUDE_ALLOW_ENTRIES[0]!);
      expect(firstNonFmarkIndex).toBeLessThan(firstFmarkIndex);
    });
  });

  it("local scope apply writes permissions to .claude/settings.local.json", async () => {
    await withTempHome(async ({ projectRoot, home }) => {
      const env = {
        HOME: home,
        F_MARK_MCP_COMMAND: "fmark-dev",
        F_MARK_MCP_ARGS: '["mcp"]',
      };
      await applyClaudeMcp({
        runtimeId: "claude",
        scope: "local",
        projectRoot,
        env,
      });

      const settings = JSON.parse(
        await readFile(join(projectRoot, ".claude", "settings.local.json"), "utf8"),
      );
      const allow = settings.permissions.allow as string[];
      for (const entry of FMARK_CLAUDE_ALLOW_ENTRIES) {
        expect(allow).toContain(entry);
      }

      /* Detect should now report `local` as installed too. */
      const detected = await detectClaudeMcp({
        runtimeId: "claude",
        projectRoot,
        env,
      });
      const localLoc = detected.locations.find((loc) => loc.scope === "local");
      expect(localLoc?.status).toBe("installed");
    });
  });
});
