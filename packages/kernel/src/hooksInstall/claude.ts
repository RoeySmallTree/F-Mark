import { homedir } from "node:os";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DetectResult, HookEntry, HookLocationStatus } from "./types.js";

export type ClaudeHookScope = "local" | "global";

const GENERIC_AUTO_STREAM_COMMAND = "npx -y f-mark hook auto-stream";

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
  return [{ event: "Stop", command: GENERIC_AUTO_STREAM_COMMAND }];
}

function isFmarkAutoStreamCommand(command: string): boolean {
  return command.includes("f-mark hook auto-stream");
}

function isExpectedClaudeCommand(command: string): boolean {
  return command.trim() === GENERIC_AUTO_STREAM_COMMAND;
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
  for (const event of ["Stop"]) {
    const arr = hooks[event] ?? [];
    for (const group of arr) {
      for (const h of group.hooks ?? []) {
        if (
          typeof h.command === "string" &&
          isExpectedClaudeCommand(h.command)
        ) {
          detected.push({ event, command: h.command });
        }
      }
    }
  }
  const installed = detected.some((e) => e.event === "Stop");
  return {
    installed,
    configPath,
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
      detectedEntries: loaded.error ? [] : detected.detectedEntries,
      expectedEntries: detected.expectedEntries,
      ...(loaded.error ? { error: loaded.error } : {}),
    });
  }

  const installedLocation = locations.find((l) => l.installed);
  const first = installedLocation ?? locations[0]!;
  return {
    installed: locations.some((l) => l.installed),
    configPath: first.configPath,
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
        return event === "Stop" && isExpectedClaudeCommand(hook.command);
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
  const snippet = {
    hooks: {
      Stop: [
        {
          hooks: [
            { type: "command", command: GENERIC_AUTO_STREAM_COMMAND },
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
