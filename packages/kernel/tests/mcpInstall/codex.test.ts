import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FMARK_MCP_TOOL_NAMES } from "../../src/mcp/tools.js";
import {
  applyCodexMcp,
  codexFmarkMcpApprovalConfigArgs,
  detectCodexMcp,
} from "../../src/mcpInstall/codex.js";

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
      expect(toml).toContain('args = ["mcp"]');
      expect(toml).not.toContain(`"--path", "${projectRoot}"`);
      expect(toml).toContain('default_tools_approval_mode = "prompt"');
      expect(toml).toContain("[mcp_servers.fmark.tools.fmark_post_prose]");
      expect(toml).toContain("[mcp_servers.fmark.tools.fmark_end_turn]");
      expect(toml).toContain('approval_mode = "approve"');
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

  it("removes owned alias tables and child tables while preserving unrelated servers", async () => {
    await withTempCodexHome(async ({ projectRoot, home, codexHome }) => {
      const configPath = join(codexHome, "config.toml");
      await writeFile(
        configPath,
        [
          'model = "gpt-5.5"',
          "",
          '[mcp_servers."fmark-old"]',
          'command = "node"',
          'args = ["/tmp/old.ts", "mcp", "--path", "/tmp/old"]',
          "",
          '[mcp_servers."fmark-old".env]',
          'F_MARK_MCP_VERSION = "phase5-stdio-v1"',
          "",
          '[mcp_servers."fmark-old".tools.fmark_post_prose]',
          'approval_mode = "approve"',
          "",
          '[mcp_servers."f-mark"]',
          'command = "f-mark"',
          `args = ["mcp", "--path", "${projectRoot}"]`,
          "",
          "[mcp_servers.other]",
          'command = "echo"',
          "",
        ].join("\n"),
      );

      const detectedBefore = await detectCodexMcp({
        runtimeId: "codex",
        projectRoot,
        env: {
          HOME: home,
          CODEX_HOME: codexHome,
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });
      expect(detectedBefore.locations.find((loc) => loc.scope === "user")?.status)
        .toBe("stale");

      await applyCodexMcp({
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

      const toml = await readFile(configPath, "utf8");
      expect(toml).toContain("[mcp_servers.other]");
      expect(toml).toContain("[mcp_servers.fmark]");
      expect(toml).not.toContain('mcp_servers."fmark-old"');
      expect(toml).not.toContain('mcp_servers."f-mark"');
      expect(toml).not.toContain("/tmp/old");

      const detectedAfter = await detectCodexMcp({
        runtimeId: "codex",
        projectRoot,
        env: {
          HOME: home,
          CODEX_HOME: codexHome,
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });
      expect(detectedAfter.locations.find((loc) => loc.scope === "user")?.status)
        .toBe("installed");
    });
  });

  it("detect marks a same-version server stale when command args include a hard-coded path", async () => {
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

  it("detect marks a current fmark server stale when tool approvals are missing", async () => {
    await withTempCodexHome(async ({ projectRoot, home, codexHome }) => {
      await writeFile(
        join(codexHome, "config.toml"),
        [
          "[mcp_servers.fmark]",
          'command = "fmark-dev"',
          'args = ["mcp"]',
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
      expect(user?.reason).toMatch(/approval_mode="approve"/);
    });
  });

  it("accepts a default approve mode as covering every fmark tool", async () => {
    await withTempCodexHome(async ({ projectRoot, home, codexHome }) => {
      await writeFile(
        join(codexHome, "config.toml"),
        [
          "[mcp_servers.fmark]",
          'command = "fmark-dev"',
          'args = ["mcp"]',
          'default_tools_approval_mode = "approve"',
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

      expect(detected.locations.find((loc) => loc.scope === "user")?.status)
        .toBe("installed");
    });
  });

  it("exports one launch config override per fmark MCP tool", () => {
    const args = codexFmarkMcpApprovalConfigArgs();
    expect(args).toHaveLength(FMARK_MCP_TOOL_NAMES.length * 2);
    expect(args).toContain(
      'mcp_servers.fmark.tools.fmark_post_prose.approval_mode="approve"',
    );
    expect(args).toContain(
      'mcp_servers.fmark.tools.fmark_end_turn.approval_mode="approve"',
    );
  });
});
