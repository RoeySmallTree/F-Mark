import { expect } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FMARK_CLAUDE_ALLOW_ENTRIES } from "../../../src/mcp/tools.js";
import { applyClaudeMcp, detectClaudeMcp } from "../../../src/mcpInstall/claude.js";
import { FMARK_MCP_INSTALL_VERSION } from "../../../src/mcpInstall/types.js";

export interface ClaudeTestContext {
  projectRoot: string;
  home: string;
  env: NodeJS.ProcessEnv;
}

type ClaudeMcpScope = "project" | "user" | "local";

export async function withTempHome(
  fn: (ctx: ClaudeTestContext) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "fmark-claude-mcp-"));
  const projectRoot = join(root, "project");
  const home = join(root, "home");
  try {
    await mkdir(projectRoot, { recursive: true });
    await mkdir(home, { recursive: true });
    await fn({ projectRoot, home, env: claudeEnv(home) });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function claudeEnv(home: string): NodeJS.ProcessEnv {
  return {
    HOME: home,
    F_MARK_MCP_COMMAND: "fmark-dev",
    F_MARK_MCP_ARGS: '["mcp"]',
  };
}

function fmarkDevServer(projectRoot: string) {
  return {
    command: "fmark-dev",
    args: ["mcp", "--path", projectRoot],
    env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
  };
}

export function versionedNodeServer(entrypoint: string, projectRoot: string) {
  return {
    command: "node",
    args: [entrypoint, "mcp", "--path", projectRoot],
    env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
  };
}

export function cliFmarkServer(projectRoot: string) {
  return {
    command: "f-mark",
    args: ["mcp", "--path", projectRoot],
  };
}

export function firstFmarkAllowEntry(): string {
  const entry = FMARK_CLAUDE_ALLOW_ENTRIES[0];
  if (entry === undefined) {
    throw new Error("FMARK_CLAUDE_ALLOW_ENTRIES must not be empty");
  }
  return entry;
}

export async function applyClaude(ctx: ClaudeTestContext, scope: ClaudeMcpScope) {
  return applyClaudeMcp({
    runtimeId: "claude",
    scope,
    projectRoot: ctx.projectRoot,
    env: ctx.env,
  });
}

export async function detectClaude(ctx: ClaudeTestContext) {
  return detectClaudeMcp({
    runtimeId: "claude",
    projectRoot: ctx.projectRoot,
    env: ctx.env,
  });
}

export async function expectClaudeLocation(
  ctx: ClaudeTestContext,
  scope: ClaudeMcpScope,
  status: string,
  reason?: RegExp,
) {
  const detected = await detectClaude(ctx);
  const loc = detected.locations.find((location) => location.scope === scope);
  expect(loc?.status).toBe(status);
  if (reason !== undefined) {
    expect(loc?.reason).toMatch(reason);
  }
  return loc;
}

export async function expectProjectFmarkServer(ctx: ClaudeTestContext) {
  const projectConfig = await readProjectMcpJson(ctx);
  expect(projectConfig.mcpServers.fmark.command).toBe("fmark-dev");
  expect(projectConfig.mcpServers.fmark.args).toEqual([
    "mcp",
    "--path",
    ctx.projectRoot,
  ]);
  return projectConfig;
}

export async function expectProjectMcpMissing(ctx: ClaudeTestContext) {
  await expect(readFile(projectMcpPath(ctx), "utf8")).rejects.toThrow();
}

export function expectAllFmarkAllowEntries(allow: readonly string[]) {
  for (const entry of FMARK_CLAUDE_ALLOW_ENTRIES) {
    expect(allow).toContain(entry);
  }
}

export async function writeClaudeProjectEnabled(ctx: ClaudeTestContext) {
  await writeClaudeJson(ctx, {
    projects: {
      [ctx.projectRoot]: { enabledMcpjsonServers: ["fmark"] },
    },
  });
}

export async function writeClaudeProjectPending(ctx: ClaudeTestContext) {
  await writeClaudeJson(ctx, {
    projects: { [ctx.projectRoot]: { enabledMcpjsonServers: [] } },
  });
}

export async function writeProjectFmarkServer(
  ctx: ClaudeTestContext,
  targetProjectRoot = ctx.projectRoot,
) {
  await writeProjectMcpJson(ctx, {
    mcpServers: {
      fmark: fmarkDevServer(targetProjectRoot),
    },
  });
}

export async function writeProjectLocalFmarkAllowEntries(ctx: ClaudeTestContext) {
  await writeProjectLocalSettingsJson(ctx, {
    permissions: { allow: [...FMARK_CLAUDE_ALLOW_ENTRIES] },
  });
}

export async function writeUserFmarkAllowEntries(ctx: ClaudeTestContext) {
  await writeUserSettingsJson(ctx, {
    permissions: { allow: [...FMARK_CLAUDE_ALLOW_ENTRIES] },
  });
}

export async function writeClaudeJson(ctx: ClaudeTestContext, value: unknown) {
  await writeJsonFile(claudeJsonPath(ctx), value);
}

export async function writeProjectMcpJson(ctx: ClaudeTestContext, value: unknown) {
  await writeJsonFile(projectMcpPath(ctx), value);
}

export async function writeUserMcpJson(ctx: ClaudeTestContext, value: unknown) {
  await writeJsonFile(userMcpPath(ctx), value);
}

export async function writeProjectLocalSettingsJson(
  ctx: ClaudeTestContext,
  value: unknown,
) {
  await mkdir(projectClaudeDir(ctx), { recursive: true });
  await writeJsonFile(projectLocalSettingsPath(ctx), value);
}

export async function writeProjectLocalSettingsRaw(
  ctx: ClaudeTestContext,
  value: string,
) {
  await mkdir(projectClaudeDir(ctx), { recursive: true });
  await writeFile(projectLocalSettingsPath(ctx), value);
}

async function writeUserSettingsJson(ctx: ClaudeTestContext, value: unknown) {
  await mkdir(join(ctx.home, ".claude"), { recursive: true });
  await writeJsonFile(join(ctx.home, ".claude", "settings.json"), value);
}

export async function readClaudeJson(ctx: ClaudeTestContext) {
  return readJsonFile(claudeJsonPath(ctx));
}

async function readProjectMcpJson(ctx: ClaudeTestContext) {
  return readJsonFile(projectMcpPath(ctx));
}

export async function readUserMcpJson(ctx: ClaudeTestContext) {
  return readJsonFile(userMcpPath(ctx));
}

export async function readProjectSettingsAllow(ctx: ClaudeTestContext) {
  const settings = await readJsonFile(projectLocalSettingsPath(ctx));
  return settings.permissions?.allow as string[];
}

export async function readUserSettingsAllow(ctx: ClaudeTestContext) {
  const settings = await readJsonFile(join(ctx.home, ".claude", "settings.json"));
  return settings.permissions?.allow as string[];
}

async function writeJsonFile(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value));
}

async function readJsonFile(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}

function claudeJsonPath(ctx: ClaudeTestContext): string {
  return join(ctx.home, ".claude.json");
}

function projectMcpPath(ctx: ClaudeTestContext): string {
  return join(ctx.projectRoot, ".mcp.json");
}

function userMcpPath(ctx: ClaudeTestContext): string {
  return join(ctx.home, ".mcp.json");
}

function projectClaudeDir(ctx: ClaudeTestContext): string {
  return join(ctx.projectRoot, ".claude");
}

function projectLocalSettingsPath(ctx: ClaudeTestContext): string {
  return join(projectClaudeDir(ctx), "settings.local.json");
}
