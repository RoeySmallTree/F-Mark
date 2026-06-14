import { homedir } from "node:os";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DetectResult, HookEntry, HookLocationStatus } from "./types.js";
import {
  FMARK_HOOK_INSTALL_VERSION,
  autoStreamHookCommand,
  autoStreamHookVersion,
  isFmarkAutoStreamCommand,
} from "./command.js";

export type ClaudeHookScope = "local" | "global";

export function claudeConfigPath(scope: ClaudeHookScope = "global", projectRoot?: string): string {
  if (scope === "local") {
    if (!projectRoot) throw new Error("projectRoot required for local Claude settings");
    return join(projectRoot, ".claude", "settings.json");
  }
  return join(homedir(), ".claude", "settings.json");
}

async function closestLocalClaudeConfigPath(projectRoot: string): Promise<string> {
  let dir = projectRoot;
  const home = homedir();
  for (;;) {
    if (dir === home && projectRoot !== home) break;
    const candidate = join(dir, ".claude", "settings.json");
    try {
      await stat(candidate);
      return candidate;
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code !== "ENOENT"
      ) {
        return candidate;
      }
    }

    if (dir === home) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return claudeConfigPath("local", projectRoot);
}

async function resolveClaudeConfigPath(
  scope: ClaudeHookScope,
  projectRoot?: string,
): Promise<string> {
  if (scope === "global") return claudeConfigPath("global");
  if (!projectRoot) throw new Error("projectRoot required for local Claude settings");
  return closestLocalClaudeConfigPath(projectRoot);
}

function expectedClaudeEntries(): HookEntry[] {
  const command = autoStreamHookCommand();
  return [
    { event: "Stop", command, version: FMARK_HOOK_INSTALL_VERSION },
    { event: "PermissionRequest", command, version: FMARK_HOOK_INSTALL_VERSION },
    /* PostToolUse lets the kernel stream tool-use events live during a
       turn instead of only at Stop. Fmark-MCP tools are filtered out in
       the auto-stream handler since they already post via the MCP server. */
    { event: "PostToolUse", command, version: FMARK_HOOK_INSTALL_VERSION },
  ];
}

function isExpectedClaudeCommand(command: string): boolean {
  return command.trim() === autoStreamHookCommand();
}

function detectedVersion(entries: HookEntry[]): string | null {
  return entries[0]?.version ?? null;
}

function statusForEntries(installed: boolean, detected: HookEntry[]) {
  if (installed) return "installed" as const;
  return detected.length > 0 ? "stale" as const : "missing" as const;
}

export function detectClaudeHooks(
  settings: unknown,
  configPath = claudeConfigPath(),
): DetectResult {
  const detected: HookEntry[] = [];
  const s = (settings ?? {}) as {
    hooks?: Record<string, Array<{ hooks?: Array<{ type?: string; command?: string }> }>>;
  };
  const hooks = s.hooks ?? {};
  for (const event of ["Stop", "PermissionRequest", "PostToolUse"]) {
    const arr = hooks[event] ?? [];
    for (const group of arr) {
      for (const h of group.hooks ?? []) {
        if (typeof h.command === "string" && isFmarkAutoStreamCommand(h.command)) {
          detected.push({
            event,
            command: h.command,
            version: autoStreamHookVersion(h.command),
          });
        }
      }
    }
  }
  const installed = detected.some((e) => e.event === "Stop" && isExpectedClaudeCommand(e.command));
  const hasPermissionRequest = detected.some(
    (e) => e.event === "PermissionRequest" && isExpectedClaudeCommand(e.command),
  );
  const hasPostToolUse = detected.some(
    (e) => e.event === "PostToolUse" && isExpectedClaudeCommand(e.command),
  );
  const allInstalled = installed && hasPermissionRequest && hasPostToolUse;
  return {
    installed: allInstalled,
    status: statusForEntries(allInstalled, detected),
    configPath,
    expectedVersion: FMARK_HOOK_INSTALL_VERSION,
    detectedVersion: detectedVersion(detected),
    detectedEntries: detected,
    expectedEntries: expectedClaudeEntries(),
  };
}

export async function loadClaudeSettings(configPath = claudeConfigPath()): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    return null;
  }
}

async function readClaudeSettingsForStatus(configPath: string): Promise<{
  exists: boolean;
  settings: unknown;
  error?: string;
}> {
  try {
    const raw = await readFile(configPath, "utf8");
    try {
      return { exists: true, settings: JSON.parse(raw) };
    } catch (err) {
      return {
        exists: true,
        settings: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code !== "ENOENT"
    ) {
      return {
        exists: true,
        settings: {},
        error: err.message,
      };
    }
    return { exists: false, settings: {} };
  }
}

export async function detectClaudeHookLocations(opts: {
  projectRoot?: string;
}): Promise<DetectResult> {
  const locations: HookLocationStatus[] = [];
  const specs: Array<{ scope: ClaudeHookScope; configPath: string }> = [];
  if (opts.projectRoot) {
    specs.push({
      scope: "local",
      configPath: await resolveClaudeConfigPath("local", opts.projectRoot),
    });
  }
  specs.push({ scope: "global", configPath: claudeConfigPath("global") });

  for (const spec of specs) {
    const loaded = await readClaudeSettingsForStatus(spec.configPath);
    const detected = detectClaudeHooks(loaded.settings, spec.configPath);
    locations.push({
      scope: spec.scope,
      configPath: spec.configPath,
      exists: loaded.exists,
      installed: loaded.error ? false : detected.installed,
      status: loaded.error ? "blocked" : detected.status,
      expectedVersion: FMARK_HOOK_INSTALL_VERSION,
      detectedVersion: loaded.error ? null : detected.detectedVersion,
      detectedEntries: loaded.error ? [] : detected.detectedEntries,
      expectedEntries: detected.expectedEntries,
      ...(loaded.error ? { error: loaded.error } : {}),
    });
  }

  const installedLocation = locations.find((l) => l.installed);
  const staleLocation = locations.find((l) => l.status === "stale");
  const first = installedLocation ?? staleLocation ?? locations[0]!;
  const overallStatus = locations.some((l) => l.status === "installed")
    ? "installed"
    : locations.some((l) => l.status === "stale")
      ? "stale"
      : locations.some((l) => l.status === "blocked")
        ? "blocked"
        : "missing";
  return {
    installed: locations.some((l) => l.installed),
    status: overallStatus,
    configPath: first.configPath,
    expectedVersion: FMARK_HOOK_INSTALL_VERSION,
    detectedVersion: first.detectedVersion,
    detectedEntries: first.detectedEntries,
    expectedEntries: first.expectedEntries,
    locations,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readSettingsForWrite(configPath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(configPath, "utf8");
    if (raw.trim().length === 0) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) throw new Error("settings root must be an object");
    return parsed;
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return {};
    }
    throw err;
  }
}

function mergeClaudeHook(settings: Record<string, unknown>, event: string, command: string): void {
  if (!isObject(settings.hooks)) settings.hooks = {};
  const hooks = settings.hooks as Record<string, unknown>;
  const current = Array.isArray(hooks[event]) ? hooks[event] : [];
  const hasCommand = current.some((group) => {
    if (!isObject(group) || !Array.isArray(group.hooks)) return false;
    return group.hooks.some(
      (hook) => isObject(hook) && hook.command === command,
    );
  });
  if (!hasCommand) {
    current.push({
      hooks: [{ type: "command", command }],
    });
  }
  hooks[event] = current;
}

function pruneLegacyClaudeHooks(settings: Record<string, unknown>): void {
  if (!isObject(settings.hooks)) return;
  const hooks = settings.hooks as Record<string, unknown>;
  for (const [event, value] of Object.entries(hooks)) {
    if (!Array.isArray(value)) continue;
    const nextGroups: unknown[] = [];
    for (const group of value) {
      if (!isObject(group) || !Array.isArray(group.hooks)) {
        nextGroups.push(group);
        continue;
      }
      const nextHooks = group.hooks.filter((hook) => {
        if (!isObject(hook) || typeof hook.command !== "string") return true;
        if (!isFmarkAutoStreamCommand(hook.command)) return true;
        return (
          (event === "Stop" ||
            event === "PermissionRequest" ||
            event === "PostToolUse") &&
          isExpectedClaudeCommand(hook.command)
        );
      });
      if (nextHooks.length > 0) {
        nextGroups.push({ ...group, hooks: nextHooks });
      }
    }
    if (nextGroups.length > 0) {
      hooks[event] = nextGroups;
    } else {
      delete hooks[event];
    }
  }
}

export async function applyClaudeHooks(opts: {
  scope: ClaudeHookScope;
  projectRoot?: string;
}): Promise<{ configPath: string; changed: boolean }> {
  const configPath = await resolveClaudeConfigPath(opts.scope, opts.projectRoot);
  const settings = await readSettingsForWrite(configPath);
  const before = JSON.stringify(settings);
  pruneLegacyClaudeHooks(settings);
  for (const entry of expectedClaudeEntries()) {
    mergeClaudeHook(settings, entry.event, entry.command);
  }
  const after = JSON.stringify(settings);
  if (before !== after) {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }
  return { configPath, changed: before !== after };
}

export function renderClaudeInstallSnippet(): string {
  const command = autoStreamHookCommand();
  const snippet = {
    hooks: {
      Stop: [
        {
          hooks: [
            { type: "command", command },
          ],
        },
      ],
      PermissionRequest: [
        {
          matcher: "Bash|Edit|Write|MultiEdit|Read|WebFetch|WebSearch",
          hooks: [
            { type: "command", command },
          ],
        },
      ],
      /* PostToolUse captures every tool call after it runs so F-Mark
         can stream live tool-use events. The matcher is unset so all
         tools route through; the auto-stream handler skips
         `mcp__fmark__*` to avoid double-writes (the MCP server emits
         those itself). */
      PostToolUse: [
        {
          hooks: [
            { type: "command", command },
          ],
        },
      ],
    },
  };
  return [
    "Merge this into `.claude/settings.json` or `~/.claude/settings.json`:",
    "",
    "```json",
    JSON.stringify(snippet, null, 2),
    "```",
  ].join("\n");
}

export function renderClaudeInstallPrompt(): string {
  const snippet = renderClaudeInstallSnippet();
  return [
    "Please install the F-Mark Claude hooks for this project.",
    "",
    "Merge the following `hooks` entry into the closest Claude settings file for this project. Preserve existing settings and existing hook entries. If a matching command already exists, do not duplicate it.",
    "",
    snippet,
  ].join("\n");
}
