import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyCodexMcp, detectCodexMcp } from "../../src/mcpInstall/codex.js";

async function withTempCodexHome(
  fn: (ctx: { projectRoot: string; home: string; codexHome: string }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "fmark-codex-mcp-"));
  const projectRoot = join(root, "project");
  const home = join(root, "home");
  const codexHome = join(home, ".codex");
  try {
    await mkdir(projectRoot, { recursive: true });
    await mkdir(codexHome, { recursive: true });
    await fn({ projectRoot, home, codexHome });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("Codex MCP install", () => {
  it("rewrites an existing fmark block and trusts the current project", async () => {
    await withTempCodexHome(async ({ projectRoot, home, codexHome }) => {
      const configPath = join(codexHome, "config.toml");
      await writeFile(
        configPath,
        [
          'model = "gpt-5.5"',
          "",
          "[mcp_servers.fmark]",
          'command = "node"',
          'args = ["/tmp/old.ts", "mcp", "--path", "/tmp/old"]',
          "",
          "[mcp_servers.fmark.env]",
          'F_MARK_MCP_VERSION = "phase5-stdio-v1"',
          "",
          "[mcp_servers.other]",
          'command = "echo"',
          "",
        ].join("\n"),
      );

      const applied = await applyCodexMcp({
        runtimeId: "codex",
        scope: "user",
        projectRoot,
        env: {
          HOME: home,
          CODEX_HOME: codexHome,
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });

      expect(applied.changed).toBe(true);
      const toml = await readFile(configPath, "utf8");
      expect(toml).toContain("[mcp_servers.other]");
      expect(toml).toContain('[mcp_servers.fmark]');
      expect(toml).toContain('command = "fmark-dev"');
      expect(toml).toContain(`args = ["mcp", "--path", "${projectRoot}"]`);
      expect(toml).not.toContain("/tmp/old");
      expect(toml).toContain(`[projects."${projectRoot}"]`);
      expect(toml).toContain('trust_level = "trusted"');

      const detected = await detectCodexMcp({
        runtimeId: "codex",
        projectRoot,
        env: {
          HOME: home,
          CODEX_HOME: codexHome,
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });
      expect(detected.locations.find((loc) => loc.scope === "user")?.status)
        .toBe("installed");
    });
  });

  it("detect marks a same-version server stale when command args point at another path", async () => {
    await withTempCodexHome(async ({ projectRoot, home, codexHome }) => {
      await writeFile(
        join(codexHome, "config.toml"),
        [
          "[mcp_servers.fmark]",
          'command = "fmark-dev"',
          'args = ["mcp", "--path", "/tmp/not-this-project"]',
          "",
          "[mcp_servers.fmark.env]",
          'F_MARK_MCP_VERSION = "phase5-stdio-v1"',
          "",
        ].join("\n"),
      );

      const detected = await detectCodexMcp({
        runtimeId: "codex",
        projectRoot,
        env: {
          HOME: home,
          CODEX_HOME: codexHome,
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });

      const user = detected.locations.find((loc) => loc.scope === "user");
      expect(user?.status).toBe("stale");
      expect(user?.reason).toMatch(/project path/);
    });
  });
});
