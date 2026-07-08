import type {
  DetectResult,
  HookEntry,
  HookInstallStatusKind,
  HookLocationStatus,
} from "../types.js";
import { claudeConfigPath, resolveClaudeConfigSpecs } from "./paths.js";
import { ClaudeHookSpecBuilder, createClaudeHookSpec } from "./spec.js";
import {
  isObject,
  readClaudeSettingsForStatus,
} from "./settings.js";

interface DetectLocationsOptions {
  projectRoot?: string;
}

class ClaudeHookDetector {
  constructor(private readonly spec: ClaudeHookSpecBuilder = createClaudeHookSpec()) {}

  detect(settings: unknown, configPath = claudeConfigPath()): DetectResult {
    const detected = this.detectEntries(settings);
    const installed = this.allExpectedEventsDetected(detected);
    return {
      installed,
      status: statusForEntries(installed, detected),
      configPath,
      expectedVersion: this.spec.expectedVersion,
      detectedVersion: detectedVersion(detected),
      detectedEntries: detected,
      expectedEntries: this.spec.expectedEntries(),
    };
  }

  async detectLocations(opts: DetectLocationsOptions): Promise<DetectResult> {
    const specs = await resolveClaudeConfigSpecs(opts.projectRoot);
    const locations = await Promise.all(
      specs.map((spec) => this.locationStatus(spec.scope, spec.configPath)),
    );
    return this.composeLocationResult(locations);
  }

  private detectEntries(settings: unknown): HookEntry[] {
    const detected: HookEntry[] = [];
    const hooks = settingsHooks(settings);

    for (const event of this.spec.expectedEntries().map((entry) => entry.event)) {
      const groups = Array.isArray(hooks[event]) ? hooks[event] : [];
      for (const group of groups) {
        detected.push(...this.detectGroupEntries(event, group));
      }
    }
    return detected;
  }

  private detectGroupEntries(event: string, group: unknown): HookEntry[] {
    return groupHooks(group)
      .map((hook) => this.detectHookEntry(event, hook))
      .filter((entry): entry is HookEntry => entry !== null);
  }

  private detectHookEntry(event: string, hook: unknown): HookEntry | null {
    if (!isObject(hook) || typeof hook.command !== "string") return null;
    if (!this.spec.isFmarkCommand(hook.command)) return null;
    return {
      event,
      command: hook.command,
      version: this.spec.versionFor(hook.command),
    };
  }

  private allExpectedEventsDetected(detected: HookEntry[]): boolean {
    return this.spec.expectedEntries().every((entry) =>
      detected.some(
        (candidate) =>
          candidate.event === entry.event &&
          this.spec.isExpectedCommand(candidate.command),
      ),
    );
  }

  private async locationStatus(
    scope: "local" | "global",
    configPath: string,
  ): Promise<HookLocationStatus> {
    const loaded = await readClaudeSettingsForStatus(configPath);
    const detected = this.detect(loaded.settings, configPath);
    if (loaded.error) {
      return {
        scope,
        configPath,
        exists: loaded.exists,
        installed: false,
        status: "blocked",
        expectedVersion: this.spec.expectedVersion,
        detectedVersion: null,
        detectedEntries: [],
        expectedEntries: detected.expectedEntries,
        error: loaded.error,
      };
    }
    return {
      scope,
      configPath,
      exists: loaded.exists,
      installed: detected.installed,
      status: detected.status,
      expectedVersion: this.spec.expectedVersion,
      detectedVersion: detected.detectedVersion,
      detectedEntries: detected.detectedEntries,
      expectedEntries: detected.expectedEntries,
    };
  }

  private composeLocationResult(locations: HookLocationStatus[]): DetectResult {
    const first = preferredLocation(locations);
    return {
      installed: locations.some((location) => location.installed),
      status: overallStatus(locations),
      configPath: first.configPath,
      expectedVersion: this.spec.expectedVersion,
      detectedVersion: first.detectedVersion,
      detectedEntries: first.detectedEntries,
      expectedEntries: first.expectedEntries,
      locations,
    };
  }
}

export function detectClaudeHooks(
  settings: unknown,
  configPath = claudeConfigPath(),
): DetectResult {
  return new ClaudeHookDetector().detect(settings, configPath);
}

export async function detectClaudeHookLocations(
  opts: DetectLocationsOptions,
): Promise<DetectResult> {
  return new ClaudeHookDetector().detectLocations(opts);
}

function settingsHooks(settings: unknown): Record<string, unknown> {
  if (!isObject(settings)) return {};
  return isObject(settings.hooks) ? settings.hooks : {};
}

function groupHooks(group: unknown): unknown[] {
  if (!isObject(group) || !Array.isArray(group.hooks)) return [];
  return group.hooks;
}

function detectedVersion(entries: HookEntry[]): string | null {
  return entries[0]?.version ?? null;
}

function statusForEntries(
  installed: boolean,
  detected: HookEntry[],
): HookInstallStatusKind {
  if (installed) return "installed";
  return detected.length > 0 ? "stale" : "missing";
}

function preferredLocation(locations: HookLocationStatus[]): HookLocationStatus {
  const first =
    locations.find((location) => location.installed) ??
    locations.find((location) => location.status === "stale") ??
    locations[0];
  if (!first) throw new Error("Claude hook location list is empty");
  return first;
}

function overallStatus(locations: HookLocationStatus[]): HookInstallStatusKind {
  if (locations.some((location) => location.status === "installed")) return "installed";
  if (locations.some((location) => location.status === "stale")) return "stale";
  if (locations.some((location) => location.status === "blocked")) return "blocked";
  return "missing";
}
