import { describe, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import {
  applyIntegration,
  preflightIntegration,
} from "../../src/mcpInstall/index.js";

describe("integration apply", () => {
  it("applies hooks as part of setup before launch", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-integration-apply-"));
    const projectRoot = join(root, "project");
    const home = join(root, "home");
    const bin = join(root, "bin");
    try {
      await mkdir(projectRoot, { recursive: true });
      await mkdir(home, { recursive: true });
      await mkdir(bin, { recursive: true });
      const claude = join(bin, "claude");
      await writeFile(claude, "#!/bin/sh\necho claude-test\n", "utf8");
      await chmod(claude, 0o755);

      const result = await applyIntegration({
        runtimeId: "claude",
        participantId: "ag-claude-1",
        scope: "project",
        projectRoot,
        env: {
          HOME: home,
          PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });

      expect(result.mcp.status).toBe("installed");
      expect(result.hooks.status).toBe("installed");
      expect(result.applied.hooks?.status).toBe("installed");
      const settings = await readFile(
        join(projectRoot, ".claude", "settings.json"),
        "utf8",
      );
      expect(settings).toContain("hook auto-stream");
      expect(settings).not.toContain("npx -y f-mark");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("applies Claude global setup to user MCP and user hooks", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-integration-global-"));
    const projectRoot = join(root, "project");
    const home = join(root, "home");
    const bin = join(root, "bin");
    const priorHome = process.env.HOME;
    try {
      process.env.HOME = home;
      await mkdir(projectRoot, { recursive: true });
      await mkdir(home, { recursive: true });
      await mkdir(bin, { recursive: true });
      const claude = join(bin, "claude");
      await writeFile(claude, "#!/bin/sh\necho claude-test\n", "utf8");
      await chmod(claude, 0o755);

      const result = await applyIntegration({
        runtimeId: "claude",
        participantId: "ag-claude-global",
        scope: "user",
        projectRoot,
        env: {
          HOME: home,
          PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });

      expect(result.applied.mcp.scope).toBe("user");
      expect(result.applied.hooks?.scope).toBe("user");
      expect(result.mcp.locations.find((loc) => loc.scope === "user")?.status).toBe(
        "installed",
      );
      expect(result.hooks.locations.find((loc) => loc.scope === "user")?.status).toBe(
        "installed",
      );
      const userClaudeConfig = await readFile(join(home, ".claude.json"), "utf8");
      expect(userClaudeConfig).toContain("mcpServers");
      const userHookConfig = await readFile(
        join(home, ".claude", "settings.json"),
        "utf8",
      );
      expect(userHookConfig).toContain("hook auto-stream");
      await expect(
        readFile(join(projectRoot, ".claude", "settings.json"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      if (priorHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = priorHome;
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  it("preflights Opencode using the registered executable path", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-opencode-preflight-"));
    const projectRoot = join(root, "project");
    const home = join(root, "home");
    const bin = join(root, "bin");
    try {
      await mkdir(projectRoot, { recursive: true });
      await mkdir(home, { recursive: true });
      await mkdir(bin, { recursive: true });
      const opencode = join(bin, "opencode-real");
      await writeFile(opencode, "#!/bin/sh\necho 1.15.12\n", "utf8");
      await chmod(opencode, 0o755);

      const result = await preflightIntegration({
        runtimeId: "opencode",
        executable: opencode,
        projectRoot,
        env: {
          HOME: home,
          PATH: "/usr/bin",
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });

      expect(result.runtime.available).toBe(true);
      expect(result.runtime.executable).toBe(opencode);
      expect(result.runtime.version).toBe("1.15.12");
      expect(result.mcp.locations.find((loc) => loc.scope === "project")?.status)
        .toBe("missing");
      expect(result.hooks.locations.find((loc) => loc.scope === "project")?.status)
        .toBe("missing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("applies Opencode setup when the executable is only in a mise node install", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-opencode-mise-"));
    const projectRoot = join(root, "project");
    const home = join(root, "home");
    const bin = join(home, ".local", "share", "mise", "installs", "node", "lts", "bin");
    try {
      await mkdir(projectRoot, { recursive: true });
      await mkdir(bin, { recursive: true });
      const opencode = join(bin, "opencode");
      await writeFile(opencode, "#!/bin/sh\necho 1.15.12\n", "utf8");
      await chmod(opencode, 0o755);

      const result = await applyIntegration({
        runtimeId: "opencode",
        scope: "project",
        projectRoot,
        env: {
          HOME: home,
          PATH: "/usr/bin",
          F_MARK_MCP_COMMAND: "fmark-dev",
          F_MARK_MCP_ARGS: '["mcp"]',
        },
      });

      expect(result.runtime.available).toBe(true);
      expect(result.runtime.executable).toBe(opencode);
      expect(result.applied.mcp.scope).toBe("project");
      expect(result.applied.hooks?.scope).toBe("project");
      expect(result.mcp.locations.find((loc) => loc.scope === "project")?.status)
        .toBe("installed");
      expect(result.hooks.locations.find((loc) => loc.scope === "project")?.status)
        .toBe("installed");
      expect(await readFile(join(projectRoot, "opencode.json"), "utf8"))
        .toContain("\"fmark\"");
      expect(await readFile(join(projectRoot, ".opencode", "plugin", "fmark.ts"), "utf8"))
        .toContain("runtime_session_id");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
