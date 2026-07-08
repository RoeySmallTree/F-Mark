import { access } from "node:fs/promises";
import { resolveClaudeConfigPath, type ClaudeHookScope } from "./paths.js";
import { ClaudeHookSpecBuilder, createClaudeHookSpec } from "./spec.js";
import {
  isObject,
  readSettingsForWrite,
  writeSettingsIfChanged,
} from "./settings.js";

interface ApplyClaudeHooksOptions {
  scope: ClaudeHookScope;
  projectRoot?: string;
}

class ClaudeHookInstaller {
  constructor(private readonly spec: ClaudeHookSpecBuilder = createClaudeHookSpec()) {}

  async apply(
    opts: ApplyClaudeHooksOptions,
  ): Promise<{ configPath: string; changed: boolean }> {
    const configPath = await resolveClaudeConfigPath(opts.scope, opts.projectRoot);
    const settings = await readSettingsForWrite(configPath);
    const before = JSON.stringify(settings);

    this.installInto(settings);
    const changed = await writeSettingsIfChanged(configPath, settings, before);
    return { configPath, changed };
  }

  installInto(settings: Record<string, unknown>): void {
    this.pruneLegacyHooks(settings);
    for (const entry of this.spec.expectedEntries()) {
      this.mergeHook(settings, entry.event, entry.command);
    }
  }

  async removeAll(
    opts: ApplyClaudeHooksOptions,
  ): Promise<{ configPath: string; changed: boolean }> {
    const configPath = await resolveClaudeConfigPath(opts.scope, opts.projectRoot);
    try {
      await access(configPath);
    } catch (err) {
      if (isMissingPathError(err)) return { configPath, changed: false };
      throw err;
    }
    const settings = await readSettingsForWrite(configPath);
    const before = JSON.stringify(settings);

    this.removeAllInto(settings);
    const changed = await writeSettingsIfChanged(configPath, settings, before);
    return { configPath, changed };
  }

  removeAllInto(settings: Record<string, unknown>): void {
    this.pruneFmarkHooks(settings, (_event, hook) =>
      this.shouldKeepNonFmarkHook(hook),
    );
  }

  private mergeHook(
    settings: Record<string, unknown>,
    event: string,
    command: string,
  ): void {
    const hooks = ensureHooks(settings);
    const current = hookGroupsForWrite(hooks, event);
    if (!current.some((group) => groupHasCommand(group, command))) {
      current.push(this.spec.installGroup());
    }
    hooks[event] = current;
  }

  private pruneLegacyHooks(settings: Record<string, unknown>): void {
    this.pruneFmarkHooks(settings, (event, hook) => this.shouldKeepHook(event, hook));
  }

  private pruneFmarkHooks(
    settings: Record<string, unknown>,
    shouldKeepHook: (event: string, hook: unknown) => boolean,
  ): void {
    if (!isObject(settings.hooks)) return;

    const hooks = settings.hooks;
    for (const [event, value] of Object.entries(hooks)) {
      if (!Array.isArray(value)) continue;

      const nextGroups = value
        .map((group) => this.pruneGroup(event, group, shouldKeepHook))
        .filter((group): group is unknown => group !== null);
      if (nextGroups.length > 0) {
        hooks[event] = nextGroups;
      } else {
        delete hooks[event];
      }
    }
  }

  private pruneGroup(
    event: string,
    group: unknown,
    shouldKeepHook: (event: string, hook: unknown) => boolean,
  ): unknown | null {
    if (!isObject(group) || !Array.isArray(group.hooks)) return group;

    const nextHooks = group.hooks.filter((hook) => shouldKeepHook(event, hook));
    if (nextHooks.length === 0) return null;
    return { ...group, hooks: nextHooks };
  }

  private shouldKeepHook(event: string, hook: unknown): boolean {
    if (!isObject(hook) || typeof hook.command !== "string") return true;
    if (!this.spec.isFmarkCommand(hook.command)) return true;
    return this.spec.isAutostreamEvent(event) && this.spec.isExpectedCommand(hook.command);
  }

  private shouldKeepNonFmarkHook(hook: unknown): boolean {
    if (!isObject(hook) || typeof hook.command !== "string") return true;
    return !this.spec.isFmarkCommand(hook.command);
  }
}

export async function applyClaudeHooks(
  opts: ApplyClaudeHooksOptions,
): Promise<{ configPath: string; changed: boolean }> {
  return new ClaudeHookInstaller().apply(opts);
}

export async function removeClaudeFmarkHooks(
  opts: ApplyClaudeHooksOptions,
): Promise<{ configPath: string; changed: boolean }> {
  return new ClaudeHookInstaller().removeAll(opts);
}

function ensureHooks(settings: Record<string, unknown>): Record<string, unknown> {
  if (!isObject(settings.hooks)) settings.hooks = {};
  return settings.hooks as Record<string, unknown>;
}

function hookGroupsForWrite(hooks: Record<string, unknown>, event: string): unknown[] {
  return Array.isArray(hooks[event]) ? hooks[event] : [];
}

function groupHasCommand(group: unknown, command: string): boolean {
  if (!isObject(group) || !Array.isArray(group.hooks)) return false;
  return group.hooks.some(
    (hook) => isObject(hook) && hook.command === command,
  );
}

function isMissingPathError(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
