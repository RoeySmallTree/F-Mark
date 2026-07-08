import type {
  HookInstallScope,
  IntegrationScope,
  RuntimeId,
} from "@f-mark/shared";
import { globalPaths, type GlobalPaths } from "../paths/global.js";
import {
  ensureIntegrationsConfig,
  readGlobalConfig,
  updateGlobalConfig,
} from "../state/globalConfig.js";

export type ScopePreferenceSource = "preference" | "default";

export interface ResolvedChosenScope {
  integrationScope: IntegrationScope;
  hookScope: HookInstallScope;
  source: ScopePreferenceSource;
}

export interface LaunchDefaults {
  model?: string;
  effort?: string;
  access_mode?: string;
}

export function defaultScope(runtimeId: RuntimeId): IntegrationScope {
  if (runtimeId === "codex") return "user";
  return "project";
}

export function hookInstallScopeFor(
  runtimeId: RuntimeId,
  scope: IntegrationScope,
): HookInstallScope {
  if (runtimeId === "codex") return "global";
  return scope === "user" ? "global" : "local";
}

export function integrationScopeForHookScope(
  runtimeId: RuntimeId,
  hook: HookInstallScope,
): IntegrationScope {
  if (runtimeId === "codex") return "user";
  return hook === "global" ? "user" : "project";
}

export async function readHookScopePreference(
  runtimeId: RuntimeId,
  g: GlobalPaths = globalPaths(),
): Promise<HookInstallScope | undefined> {
  const config = await readGlobalConfig(g);
  const hookScope = config.integrations?.[runtimeId]?.hook_scope;
  if (hookScope !== "global" && hookScope !== "local") return undefined;
  return hookInstallScopeFor(
    runtimeId,
    integrationScopeForHookScope(runtimeId, hookScope),
  );
}

export async function writeHookScopePreference(
  runtimeId: RuntimeId,
  scope: HookInstallScope,
  g: GlobalPaths = globalPaths(),
): Promise<void> {
  const normalized = hookInstallScopeFor(
    runtimeId,
    integrationScopeForHookScope(runtimeId, scope),
  );
  await updateGlobalConfig(g, (config) => {
    const integrations = ensureIntegrationsConfig(config);
    const current = integrations[runtimeId] ?? {};
    integrations[runtimeId] = {
      ...current,
      hook_scope: normalized,
      updated_at: new Date().toISOString(),
    };
    return config;
  });
}

export async function readLaunchDefaults(
  runtimeId: RuntimeId,
  g: GlobalPaths = globalPaths(),
): Promise<LaunchDefaults> {
  const config = await readGlobalConfig(g);
  const current = config.integrations?.[runtimeId];
  if (current === undefined) return {};
  return {
    ...(nonEmpty(current.model) ? { model: current.model } : {}),
    ...(nonEmpty(current.effort) ? { effort: current.effort } : {}),
    ...(nonEmpty(current.access_mode)
      ? { access_mode: current.access_mode }
      : {}),
  };
}

export async function writeLaunchDefaults(
  runtimeId: RuntimeId,
  defaults: LaunchDefaults,
  g: GlobalPaths = globalPaths(),
): Promise<void> {
  const patch: LaunchDefaults = {
    ...(nonEmpty(defaults.model) ? { model: defaults.model } : {}),
    ...(nonEmpty(defaults.effort) ? { effort: defaults.effort } : {}),
    ...(nonEmpty(defaults.access_mode)
      ? { access_mode: defaults.access_mode }
      : {}),
  };
  if (
    patch.model === undefined &&
    patch.effort === undefined &&
    patch.access_mode === undefined
  ) {
    return;
  }

  await updateGlobalConfig(g, (config) => {
    const integrations = ensureIntegrationsConfig(config);
    const current = integrations[runtimeId] ?? {};
    integrations[runtimeId] = {
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    return config;
  });
}

export async function resolveChosenScope(
  runtimeId: RuntimeId,
  g: GlobalPaths = globalPaths(),
): Promise<ResolvedChosenScope> {
  const preferred = await readHookScopePreference(runtimeId, g);
  if (preferred !== undefined) {
    return {
      hookScope: preferred,
      integrationScope: integrationScopeForHookScope(runtimeId, preferred),
      source: "preference",
    };
  }
  const integrationScope = defaultScope(runtimeId);
  return {
    integrationScope,
    hookScope: hookInstallScopeFor(runtimeId, integrationScope),
    source: "default",
  };
}

function nonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
