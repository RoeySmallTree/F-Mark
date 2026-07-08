import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { IntegrationLocation } from "@f-mark/shared";
import {
  ensureObject,
  getObject,
  readJsonConfig,
  readJsonObjectForWrite,
  writeJsonObjectIfChanged,
} from "./json.js";
import {
  inspectOpencodeFmarkMcpServers,
  ownedFmarkMcpNames,
  summarizeFmarkDefinitions,
} from "./ownership.js";
import {
  FMARK_MCP_INSTALL_VERSION,
  fmarkMcpCommandSpec,
  makeCheck,
  configHome,
  type McpApplyInput,
  type McpDetectInput,
} from "./types.js";

async function firstExisting(candidates: string[]): Promise<string | null> {
  for (const c of candidates) {
    try {
      await stat(c);
      return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

function projectCandidates(projectRoot: string): string[] {
  // Prefer existing file. If neither exists, default to `.json`.
  return [join(projectRoot, "opencode.json"), join(projectRoot, "opencode.jsonc")];
}

function userCandidates(env: NodeJS.ProcessEnv): string[] {
  const base = join(configHome(env), "opencode");
  return [join(base, "opencode.json"), join(base, "opencode.jsonc")];
}

async function detectAt(
  scope: "project" | "user",
  candidates: string[],
  safeAutoApply: boolean,
  expected: { command: string; args: string[] },
): Promise<IntegrationLocation> {
  const path = (await firstExisting(candidates)) ?? candidates[0]!;
  const loaded = await readJsonConfig(path);
  if (!loaded.ok) {
    return {
      scope,
      path,
      status: "blocked",
      reason: `invalid JSON/JSONC: ${loaded.error}`,
      safe_auto_apply: false,
    };
  }
  if (!loaded.exists) {
    return { scope, path, status: "missing", safe_auto_apply: safeAutoApply };
  }
  const servers = getObject(loaded.value, "mcp");
  const pathIndex = expected.args.lastIndexOf("--path");
  const current = summarizeFmarkDefinitions(
    inspectOpencodeFmarkMcpServers({
      servers,
      projectRoot: pathIndex >= 0 ? expected.args[pathIndex + 1] ?? "" : "",
      expected,
    }),
  );
  return {
    scope,
    path,
    status: current.status,
    version: current.version,
    reason: current.reason,
    safe_auto_apply: safeAutoApply,
  };
}

export async function detectOpencodeMcp(input: McpDetectInput) {
  const expected = fmarkMcpCommandSpec(input.projectRoot, input.env);
  const locations = [
    await detectAt("project", projectCandidates(input.projectRoot), true, expected),
    await detectAt("user", userCandidates(input.env), true, expected),
  ];
  const check = makeCheck(locations);
  const activeLocations = locations.filter(
    (location) => location.status === "installed" || location.status === "stale",
  );
  if (activeLocations.length > 1) check.status = "stale";
  return check;
}

function opencodeServer(input: McpApplyInput): Record<string, unknown> {
  const spec = fmarkMcpCommandSpec(input.projectRoot, input.env);
  return {
    type: "local",
    command: [spec.command, ...spec.args],
    environment: spec.env,
    enabled: true,
  };
}

async function preflightOpencodeConfigs(input: McpApplyInput): Promise<void> {
  const paths = [
    (await firstExisting(projectCandidates(input.projectRoot))) ??
      projectCandidates(input.projectRoot)[0]!,
    (await firstExisting(userCandidates(input.env))) ?? userCandidates(input.env)[0]!,
  ];
  for (const path of paths) {
    const loaded = await readJsonObjectForWrite(path);
    if (!loaded.ok) throw new Error(`blocked MCP config ${path}: ${loaded.error}`);
  }
}

function removeOwnedOpencodeServers(input: {
  servers: Record<string, unknown> | null;
  projectRoot: string;
  env: NodeJS.ProcessEnv;
}): string[] {
  if (input.servers === null) return [];
  const definitions = inspectOpencodeFmarkMcpServers({
    servers: input.servers,
    projectRoot: input.projectRoot,
    expected: fmarkMcpCommandSpec(input.projectRoot, input.env),
  });
  const names = ownedFmarkMcpNames(definitions);
  for (const name of names) delete input.servers[name];
  return [...names];
}

async function removeOpencodeOwnedAt(
  input: McpApplyInput,
  path: string,
): Promise<boolean> {
  const loaded = await readJsonObjectForWrite(path);
  if (!loaded.ok) throw new Error(`blocked MCP config ${path}: ${loaded.error}`);
  const servers = getObject(loaded.value, "mcp");
  const removedNames = removeOwnedOpencodeServers({
    servers,
    projectRoot: input.projectRoot,
    env: input.env,
  });
  if (removedNames.length === 0) return false;
  return writeJsonObjectIfChanged(path, loaded.raw, loaded.value);
}

export async function applyOpencodeMcp(input: McpApplyInput) {
  if (input.scope !== "project" && input.scope !== "user") {
    throw new Error(`Opencode MCP apply does not support scope: ${input.scope}`);
  }
  await preflightOpencodeConfigs(input);
  const candidates =
    input.scope === "project"
      ? projectCandidates(input.projectRoot)
      : userCandidates(input.env);
  const path = (await firstExisting(candidates)) ?? candidates[0]!;
  const loaded = await readJsonObjectForWrite(path);
  if (!loaded.ok) throw new Error(`blocked MCP config ${path}: ${loaded.error}`);
  const servers = ensureObject(loaded.value, "mcp");
  removeOwnedOpencodeServers({
    servers,
    projectRoot: input.projectRoot,
    env: input.env,
  });
  servers.fmark = opencodeServer(input);
  const changed = await writeJsonObjectIfChanged(path, loaded.raw, loaded.value);
  const otherCandidates =
    input.scope === "project"
      ? userCandidates(input.env)
      : projectCandidates(input.projectRoot);
  const otherPath = (await firstExisting(otherCandidates)) ?? otherCandidates[0]!;
  const cleanupChanged = await removeOpencodeOwnedAt(input, otherPath);
  return {
    changed: changed || cleanupChanged,
    location: {
      scope: input.scope,
      path,
      status: "installed" as const,
      version: FMARK_MCP_INSTALL_VERSION,
      safe_auto_apply: true,
    },
  };
}
