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
  inspectClaudeFmarkMcpServers,
  ownedFmarkMcpNames,
  summarizeFmarkDefinitions,
} from "./ownership.js";
import {
  fmarkMcpCommandSpec,
  makeCheck,
  userHome,
  type McpApplyInput,
  type McpDetectInput,
} from "./types.js";
import { FMARK_CLAUDE_ALLOW_ENTRIES } from "../mcp/tools.js";

/**
 * Path to the Claude settings file that holds `permissions.allow` for the
 * given install scope:
 *
 * - `project` and `local` → `<projectRoot>/.claude/settings.local.json`
 *   (gitignored; matches the existing convention this project already uses).
 * - `user` → `~/.claude/settings.json` (user-global).
 *
 * The MCP server registration and the permissions allow-list live in
 * different files because Claude reads `permissions.allow` from
 * `.claude/settings.json` (and `.local.json`), not from `.mcp.json` or
 * `~/.claude.json` itself.
 */
function claudePermissionsPath(
  scope: "project" | "user" | "local",
  projectRoot: string,
  env: NodeJS.ProcessEnv,
): string {
  if (scope === "user") {
    return join(userHome(env), ".claude", "settings.json");
  }
  return join(projectRoot, ".claude", "settings.local.json");
}

/**
 * All Claude settings files that contribute to the effective merged
 * `permissions.allow` for a given project. Claude unions the `allow`
 * arrays across these three, so drift detection must consult all of
 * them — not just the file we'd write to.
 */
function claudePermissionsSourcePaths(
  projectRoot: string,
  env: NodeJS.ProcessEnv,
): string[] {
  return [
    join(userHome(env), ".claude", "settings.json"),
    join(projectRoot, ".claude", "settings.json"),
    join(projectRoot, ".claude", "settings.local.json"),
  ];
}

type PermissionsRead =
  | { kind: "missing" }
  | { kind: "valid"; value: unknown }
  | { kind: "invalid"; error: string };

async function readClaudePermissionsValue(path: string): Promise<PermissionsRead> {
  const loaded = await readJsonConfig(path);
  if (!loaded.ok) return { kind: "invalid", error: loaded.error };
  if (!loaded.exists) return { kind: "missing" };
  /* A valid settings file must be a plain object. Reject arrays / scalars
     so they don't slip past `inspectClaudeAllowEntries` (which returns an
     empty allow set for non-objects) and then trip `applyClaudeAllowList`
     after `.mcp.json` has already been mutated. */
  if (
    loaded.value === null ||
    typeof loaded.value !== "object" ||
    Array.isArray(loaded.value)
  ) {
    return {
      kind: "invalid",
      error: "settings root must be a JSON object",
    };
  }
  return { kind: "valid", value: loaded.value };
}

function allowEntriesFromValue(value: unknown): Set<string> {
  const out = new Set<string>();
  if (value === null || typeof value !== "object" || Array.isArray(value)) return out;
  const permissions = getObject(value, "permissions");
  if (permissions === null) return out;
  const allow = permissions.allow;
  if (!Array.isArray(allow)) return out;
  for (const item of allow) {
    if (typeof item === "string") out.add(item);
  }
  return out;
}

/**
 * Aggregate the effective `permissions.allow` across all settings sources
 * and surface any invalid file. Detect should treat invalid as `blocked`
 * (not "safe to auto-apply") so we don't mask a corrupted settings file
 * by silently writing on top of it.
 */
async function inspectClaudeAllowEntries(
  projectRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<
  | { kind: "ok"; missing: string[] }
  | { kind: "invalid"; path: string; error: string }
> {
  const effective = new Set<string>();
  for (const path of claudePermissionsSourcePaths(projectRoot, env)) {
    const read = await readClaudePermissionsValue(path);
    if (read.kind === "invalid") {
      return { kind: "invalid", path, error: read.error };
    }
    if (read.kind === "valid") {
      for (const entry of allowEntriesFromValue(read.value)) effective.add(entry);
    }
  }
  const missing = FMARK_CLAUDE_ALLOW_ENTRIES.filter((entry) => !effective.has(entry));
  return { kind: "ok", missing };
}

async function preflightClaudePermissionFiles(
  projectRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  for (const path of claudePermissionsSourcePaths(projectRoot, env)) {
    const read = await readClaudePermissionsValue(path);
    if (read.kind === "invalid") {
      throw new Error(`blocked Claude permissions config ${path}: ${read.error}`);
    }
  }
}

async function applyClaudeAllowList(
  scope: "project" | "user" | "local",
  projectRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  const path = claudePermissionsPath(scope, projectRoot, env);
  const loaded = await readJsonObjectForWrite(path);
  if (!loaded.ok) {
    /* preflight should have caught this — keep the guard as defence in depth */
    throw new Error(`blocked Claude permissions config ${path}: ${loaded.error}`);
  }
  const permissions = ensureObject(loaded.value, "permissions");
  const existingAllow = Array.isArray(permissions.allow) ? permissions.allow : [];
  const allowSet = new Set<string>(
    existingAllow.filter((item): item is string => typeof item === "string"),
  );
  for (const entry of FMARK_CLAUDE_ALLOW_ENTRIES) allowSet.add(entry);
  permissions.allow = [...allowSet];
  return writeJsonObjectIfChanged(path, loaded.raw, loaded.value);
}

async function detectClaudeJson(
  scope: "project" | "user",
  path: string,
  safeAutoApply: boolean,
  projectRoot?: string,
  userConfigPath?: string,
  env?: NodeJS.ProcessEnv,
): Promise<IntegrationLocation> {
  const loaded = await readJsonConfig(path);
  if (!loaded.ok) {
    return {
      scope,
      path,
      status: "blocked",
      reason: `invalid JSON: ${loaded.error}`,
      safe_auto_apply: false,
    };
  }
  if (!loaded.exists) {
    return { scope, path, status: "missing", safe_auto_apply: safeAutoApply };
  }
  const servers = getObject(loaded.value, "mcpServers");
  const current = summarizeFmarkDefinitions(
    inspectClaudeFmarkMcpServers({
      servers,
      projectRoot: projectRoot ?? "",
      expected:
        projectRoot !== undefined && env !== undefined
          ? fmarkMcpCommandSpec(projectRoot, env)
          : undefined,
    }),
  );
  if (
    scope === "project" &&
    current.status === "installed" &&
    projectRoot !== undefined &&
    userConfigPath !== undefined
  ) {
    const enabled = await claudeProjectMcpJsonServerEnabled(
      projectRoot,
      userConfigPath,
    );
    if (!enabled.ok) {
      return {
        scope,
        path,
        status: "blocked",
        version: current.version,
        reason: enabled.reason,
        safe_auto_apply: false,
      };
    }
    if (!enabled.enabled) {
      return {
        scope,
        path,
        status: "stale",
        version: current.version,
        reason: "`fmark` is not enabled in ~/.claude.json enabledMcpjsonServers",
        safe_auto_apply: safeAutoApply,
      };
    }
  }
  if (current.status === "installed" && projectRoot !== undefined && env !== undefined) {
    const inspection = await inspectClaudeAllowEntries(projectRoot, env);
    if (inspection.kind === "invalid") {
      return {
        scope,
        path,
        status: "blocked",
        version: current.version,
        reason: `invalid JSON in ${inspection.path}: ${inspection.error}`,
        safe_auto_apply: false,
      };
    }
    if (inspection.missing.length > 0) {
      return {
        scope,
        path,
        status: "stale",
        version: current.version,
        reason: `${inspection.missing.length} fmark MCP tool${inspection.missing.length === 1 ? "" : "s"} missing from Claude permissions.allow (across user, project, and local settings)`,
        safe_auto_apply: safeAutoApply,
      };
    }
  }
  return {
    scope,
    path,
    status: current.status,
    version: current.version,
    reason: current.reason,
    safe_auto_apply: safeAutoApply,
  };
}

async function claudeProjectMcpJsonServerEnabled(
  projectRoot: string,
  path: string,
): Promise<{ ok: true; enabled: boolean } | { ok: false; reason: string }> {
  const loaded = await readJsonConfig(path);
  if (!loaded.ok) {
    return { ok: false, reason: `invalid JSON in ${path}: ${loaded.error}` };
  }
  if (!loaded.exists) return { ok: true, enabled: false };
  const projects = getObject(loaded.value, "projects");
  const project = projects !== null ? getObject(projects, projectRoot) : null;
  const enabled = project?.enabledMcpjsonServers;
  return {
    ok: true,
    enabled: Array.isArray(enabled) && enabled.includes("fmark"),
  };
}

async function detectClaudeLocalJson(
  projectRoot: string,
  path: string,
  env: NodeJS.ProcessEnv,
): Promise<IntegrationLocation> {
  const loaded = await readJsonConfig(path);
  if (!loaded.ok) {
    return {
      scope: "local",
      path,
      status: "blocked",
      reason: `invalid JSON: ${loaded.error}`,
      safe_auto_apply: false,
    };
  }
  if (!loaded.exists) {
    return { scope: "local", path, status: "missing", safe_auto_apply: true };
  }
  const projects = getObject(loaded.value, "projects");
  const project = projects !== null ? getObject(projects, projectRoot) : null;
  const servers = project !== null ? getObject(project, "mcpServers") : null;
  const current = summarizeFmarkDefinitions(
    inspectClaudeFmarkMcpServers({
      servers,
      projectRoot,
      expected: fmarkMcpCommandSpec(projectRoot, env),
    }),
  );
  if (current.status === "installed") {
    const inspection = await inspectClaudeAllowEntries(projectRoot, env);
    if (inspection.kind === "invalid") {
      return {
        scope: "local",
        path,
        status: "blocked",
        version: current.version,
        reason: `invalid JSON in ${inspection.path}: ${inspection.error}`,
        safe_auto_apply: false,
      };
    }
    if (inspection.missing.length > 0) {
      return {
        scope: "local",
        path,
        status: "stale",
        version: current.version,
        reason: `${inspection.missing.length} fmark MCP tool${inspection.missing.length === 1 ? "" : "s"} missing from Claude permissions.allow (across user, project, and local settings)`,
        safe_auto_apply: true,
      };
    }
  }
  return {
    scope: "local",
    path,
    status: current.status,
    version: current.version,
    reason: current.reason,
    safe_auto_apply: true,
  };
}

export async function detectClaudeMcp(input: McpDetectInput) {
  const userConfig = join(userHome(input.env), ".claude.json");
  const legacyUserConfig = join(userHome(input.env), ".mcp.json");
  const locations = [
    await detectClaudeJson(
      "project",
      join(input.projectRoot, ".mcp.json"),
      true,
      input.projectRoot,
      userConfig,
      input.env,
    ),
    await detectClaudeJson(
      "user",
      userConfig,
      true,
      input.projectRoot,
      undefined,
      input.env,
    ),
    await detectClaudeLocalJson(input.projectRoot, userConfig, input.env),
    await detectClaudeJson(
      "user",
      legacyUserConfig,
      true,
      input.projectRoot,
      undefined,
      input.env,
    ),
  ];
  const check = makeCheck(locations);
  const activeLocations = locations.filter(
    (location) => location.status === "installed" || location.status === "stale",
  );
  if (activeLocations.length > 1) {
    check.status = "stale";
  }
  return check;
}

function claudeServer(input: McpApplyInput): Record<string, unknown> {
  const spec = fmarkMcpCommandSpec(input.projectRoot, input.env);
  return {
    type: "stdio",
    command: spec.command,
    args: spec.args,
    env: spec.env,
  };
}

async function preflightClaudeMcpConfigFiles(input: McpApplyInput): Promise<void> {
  const userConfig = join(userHome(input.env), ".claude.json");
  const paths = [
    join(input.projectRoot, ".mcp.json"),
    userConfig,
    join(userHome(input.env), ".mcp.json"),
  ];
  for (const path of paths) {
    const loaded = await readJsonObjectForWrite(path);
    if (!loaded.ok) {
      throw new Error(`blocked MCP config ${path}: ${loaded.error}`);
    }
  }
}

function removeOwnedClaudeServers(input: {
  servers: Record<string, unknown> | null;
  projectRoot: string;
  env: NodeJS.ProcessEnv;
}): string[] {
  if (input.servers === null) return [];
  const definitions = inspectClaudeFmarkMcpServers({
    servers: input.servers,
    projectRoot: input.projectRoot,
    expected: fmarkMcpCommandSpec(input.projectRoot, input.env),
  });
  const names = ownedFmarkMcpNames(definitions);
  for (const name of names) delete input.servers[name];
  return [...names];
}

async function applyClaudeTopLevel(
  input: McpApplyInput,
  scope: "project" | "user",
  path: string,
) {
  const loaded = await readJsonObjectForWrite(path);
  if (!loaded.ok) {
    throw new Error(`blocked MCP config ${path}: ${loaded.error}`);
  }
  const servers = ensureObject(loaded.value, "mcpServers");
  const removedNames = removeOwnedClaudeServers({
    servers,
    projectRoot: input.projectRoot,
    env: input.env,
  });
  servers.fmark = claudeServer(input);
  const changed = await writeJsonObjectIfChanged(path, loaded.raw, loaded.value);
  return {
    changed,
    removedNames,
    location: {
      scope,
      path,
      status: "installed" as const,
      version: fmarkMcpCommandSpec(input.projectRoot, input.env).env.F_MARK_MCP_VERSION,
      safe_auto_apply: true,
    },
  };
}

async function removeClaudeTopLevelOwned(
  input: McpApplyInput,
  path: string,
): Promise<{ changed: boolean; removedNames: string[] }> {
  const loaded = await readJsonObjectForWrite(path);
  if (!loaded.ok) {
    throw new Error(`blocked MCP config ${path}: ${loaded.error}`);
  }
  const servers = getObject(loaded.value, "mcpServers");
  const removedNames = removeOwnedClaudeServers({
    servers,
    projectRoot: input.projectRoot,
    env: input.env,
  });
  if (removedNames.length === 0) return { changed: false, removedNames };
  return {
    changed: await writeJsonObjectIfChanged(path, loaded.raw, loaded.value),
    removedNames,
  };
}

function stringArrayWithoutMany(value: unknown, excluded: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && !excluded.has(item),
  );
}

async function enableClaudeProjectMcpJsonServer(
  projectRoot: string,
  path: string,
  removedNames: string[] = [],
): Promise<boolean> {
  const loaded = await readJsonObjectForWrite(path);
  if (!loaded.ok) {
    throw new Error(`blocked Claude config ${path}: ${loaded.error}`);
  }
  const projects = ensureObject(loaded.value, "projects");
  const project = ensureObject(projects, projectRoot);
  const excluded = new Set([...removedNames, "fmark"]);
  const enabled = stringArrayWithoutMany(project.enabledMcpjsonServers, excluded);
  enabled.push("fmark");
  project.enabledMcpjsonServers = enabled;
  project.disabledMcpjsonServers = stringArrayWithoutMany(
    project.disabledMcpjsonServers,
    excluded,
  );
  return writeJsonObjectIfChanged(path, loaded.raw, loaded.value);
}

async function disableClaudeProjectMcpJsonServer(
  projectRoot: string,
  path: string,
  removedNames: string[] = [],
): Promise<boolean> {
  const loaded = await readJsonObjectForWrite(path);
  if (!loaded.ok) {
    throw new Error(`blocked Claude config ${path}: ${loaded.error}`);
  }
  const projects = getObject(loaded.value, "projects");
  const project = projects !== null ? getObject(projects, projectRoot) : null;
  if (project === null) return false;
  const excluded = new Set([...removedNames, "fmark"]);
  project.enabledMcpjsonServers = stringArrayWithoutMany(
    project.enabledMcpjsonServers,
    excluded,
  );
  project.disabledMcpjsonServers = stringArrayWithoutMany(
    project.disabledMcpjsonServers,
    excluded,
  );
  return writeJsonObjectIfChanged(path, loaded.raw, loaded.value);
}

async function applyClaudeLocal(input: McpApplyInput, path: string) {
  const loaded = await readJsonObjectForWrite(path);
  if (!loaded.ok) {
    throw new Error(`blocked MCP config ${path}: ${loaded.error}`);
  }
  const projects = ensureObject(loaded.value, "projects");
  const project = ensureObject(projects, input.projectRoot);
  const servers = ensureObject(project, "mcpServers");
  const removedNames = removeOwnedClaudeServers({
    servers,
    projectRoot: input.projectRoot,
    env: input.env,
  });
  servers.fmark = claudeServer(input);
  const changed = await writeJsonObjectIfChanged(path, loaded.raw, loaded.value);
  return {
    changed,
    removedNames,
    location: {
      scope: "local" as const,
      path,
      status: "installed" as const,
      version: fmarkMcpCommandSpec(input.projectRoot, input.env).env.F_MARK_MCP_VERSION,
      safe_auto_apply: true,
    },
  };
}

async function removeClaudeLocalFmark(
  input: McpApplyInput,
  path: string,
): Promise<{ changed: boolean; removedNames: string[] }> {
  const loaded = await readJsonObjectForWrite(path);
  if (!loaded.ok) {
    throw new Error(`blocked MCP config ${path}: ${loaded.error}`);
  }
  const projects = getObject(loaded.value, "projects");
  const project = projects !== null ? getObject(projects, input.projectRoot) : null;
  const servers = project !== null ? getObject(project, "mcpServers") : null;
  const removedNames = removeOwnedClaudeServers({
    servers,
    projectRoot: input.projectRoot,
    env: input.env,
  });
  if (removedNames.length === 0) return { changed: false, removedNames };
  return {
    changed: await writeJsonObjectIfChanged(path, loaded.raw, loaded.value),
    removedNames,
  };
}

async function cleanupCompetingClaudeMcpScopes(
  input: McpApplyInput,
): Promise<{ changed: boolean; removedNames: string[] }> {
  const userConfig = join(userHome(input.env), ".claude.json");
  const projectConfig = join(input.projectRoot, ".mcp.json");
  const legacyUserConfig = join(userHome(input.env), ".mcp.json");
  let changed = false;
  const removedNames: string[] = [];

  function collect(result: { changed: boolean; removedNames: string[] }): void {
    changed = result.changed || changed;
    removedNames.push(...result.removedNames);
  }

  if (input.scope !== "project") {
    const removed = await removeClaudeTopLevelOwned(input, projectConfig);
    collect(removed);
    changed =
      (await disableClaudeProjectMcpJsonServer(
        input.projectRoot,
        userConfig,
        removed.removedNames,
      )) || changed;
  }
  if (input.scope !== "user") {
    collect(await removeClaudeTopLevelOwned(input, userConfig));
  }
  if (input.scope !== "local") {
    collect(await removeClaudeLocalFmark(input, userConfig));
  }
  collect(await removeClaudeTopLevelOwned(input, legacyUserConfig));
  return { changed, removedNames };
}

export async function applyClaudeMcp(input: McpApplyInput) {
  const userConfig = join(userHome(input.env), ".claude.json");
  /* Preflight every Claude permissions file before we mutate `.mcp.json` or
     `~/.claude.json`. If any settings file is corrupted, throwing here
     leaves the MCP-server registration untouched — better than the partial-
     install state we'd otherwise leave behind. */
  await preflightClaudePermissionFiles(input.projectRoot, input.env);
  await preflightClaudeMcpConfigFiles(input);
  if (input.scope === "project") {
    const applied = await applyClaudeTopLevel(
      input,
      "project",
      join(input.projectRoot, ".mcp.json"),
    );
    const cleanupChanged = await cleanupCompetingClaudeMcpScopes(input);
    const enabledChanged = await enableClaudeProjectMcpJsonServer(
      input.projectRoot,
      userConfig,
      [...applied.removedNames, ...cleanupChanged.removedNames],
    );
    const allowChanged = await applyClaudeAllowList(
      "project",
      input.projectRoot,
      input.env,
    );
    return {
      ...applied,
      changed:
        applied.changed ||
        cleanupChanged.changed ||
        enabledChanged ||
        allowChanged,
    };
  }
  if (input.scope === "user") {
    /* User-scope writes the allow-list to `~/.claude/settings.json`, which
       Claude applies project-wide. The blast radius is intentional:
       another MCP server named `fmark` exposing matching tool names would
       also be auto-approved. We enumerate exact entries (not a wildcard)
       so future fmark tools must be added deliberately. */
    const applied = await applyClaudeTopLevel(input, "user", userConfig);
    const cleanupChanged = await cleanupCompetingClaudeMcpScopes(input);
    const allowChanged = await applyClaudeAllowList(
      "user",
      input.projectRoot,
      input.env,
    );
    return {
      ...applied,
      changed: applied.changed || cleanupChanged.changed || allowChanged,
    };
  }
  if (input.scope === "local") {
    const applied = await applyClaudeLocal(input, userConfig);
    const cleanupChanged = await cleanupCompetingClaudeMcpScopes(input);
    const allowChanged = await applyClaudeAllowList(
      "local",
      input.projectRoot,
      input.env,
    );
    return {
      ...applied,
      changed: applied.changed || cleanupChanged.changed || allowChanged,
    };
  }
  throw new Error(`Claude MCP apply does not support scope: ${input.scope}`);
}
