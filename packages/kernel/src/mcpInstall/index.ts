import { execFile } from "node:child_process";
import type {
  IntegrationApplyResponse,
  IntegrationCheck,
  IntegrationLocation,
  IntegrationPreflightResponse,
  IntegrationScope,
  RuntimeCapability,
  RuntimeId,
} from "@f-mark/shared";
import {
  applyAutomaticHookInstall,
  checkHookInstallStatus,
  reconcileHookScopes,
} from "../hooksInstall/index.js";
import { FMARK_HOOK_INSTALL_VERSION } from "../hooksInstall/command.js";
import {
  envWithExecutableSearchPath,
  resolveExecutableForExec,
} from "../runtimes/executableSearch.js";
import { applyClaudeMcp, detectClaudeMcp } from "./claude.js";
import { applyCodexMcp, detectCodexMcp } from "./codex.js";
import { applyOpencodeMcp, detectOpencodeMcp } from "./opencode.js";
import {
  makeCheck,
  runtimeUnavailable,
  summarizeStatus,
  type McpApplyInput,
  type McpDetectInput,
} from "./types.js";
import {
  defaultScope,
  hookInstallScopeFor,
  integrationScopeForHookScope,
} from "./scopePreference.js";

export { defaultScope } from "./scopePreference.js";

function executableFor(runtimeId: RuntimeId, configuredExecutable?: string): string {
  if (configuredExecutable !== undefined && configuredExecutable.length > 0) {
    return configuredExecutable;
  }
  return runtimeId === "claude" ||
    runtimeId === "codex" ||
    runtimeId === "opencode"
    ? runtimeId
    : String(runtimeId);
}

async function execVersion(
  executable: string,
  env: NodeJS.ProcessEnv,
): Promise<{ executable: string; version: string }> {
  const probeEnv = envWithExecutableSearchPath(env);
  const resolvedExecutable = await resolveExecutableForExec(executable, probeEnv);
  return new Promise((resolve, reject) => {
    const child = execFile(
      resolvedExecutable,
      ["--version"],
      { env: probeEnv, timeout: 10_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({
          executable: resolvedExecutable,
          version: (stdout || stderr).toString().trim(),
        });
      },
    );
    child.stdin?.end();
  });
}

async function probeRuntime(
  runtimeId: RuntimeId,
  env: NodeJS.ProcessEnv,
  configuredExecutable?: string,
): Promise<RuntimeCapability> {
  const executable = executableFor(runtimeId, configuredExecutable);
  try {
    const result = await execVersion(executable, env);
    return {
      runtime_id: runtimeId,
      executable: result.executable,
      version: result.version,
      available: true,
    };
  } catch (err) {
    return runtimeUnavailable(
      runtimeId,
      executable,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function detectMcp(
  input: McpDetectInput & { chosenScope?: IntegrationScope },
): Promise<IntegrationCheck> {
  let check: IntegrationCheck;
  if (input.runtimeId === "claude") check = await detectClaudeMcp(input);
  else if (input.runtimeId === "codex") check = await detectCodexMcp(input);
  else if (input.runtimeId === "opencode") check = await detectOpencodeMcp(input);
  else {
    check = makeCheck([
      {
        scope: "project",
        path: input.projectRoot,
        status: "unsupported",
        reason: `unsupported runtime_id: ${input.runtimeId}`,
        safe_auto_apply: false,
      },
    ]);
  }
  return summarizeMcpCheckForScope(check, input.chosenScope, input.runtimeId);
}

function hookIntegrationLocation(input: {
  scope: IntegrationScope;
  path: string;
  status: IntegrationLocation["status"];
  expectedVersion?: string;
  detectedVersion?: string | null;
  error?: string;
  safeAutoApply: boolean;
}): IntegrationLocation {
  const expectedVersion = input.expectedVersion ?? FMARK_HOOK_INSTALL_VERSION;
  const staleReason =
    input.status === "stale"
      ? input.detectedVersion === expectedVersion
        ? "installed hook version matches, but the command or trust state does not match the managed F-Mark hook"
        : `installed hook ${input.detectedVersion ?? "legacy"}; expected ${expectedVersion}`
      : undefined;
  return {
    scope: input.scope,
    path: input.path,
    status: input.status,
    ...(input.detectedVersion !== undefined && input.detectedVersion !== null
      ? { version: input.detectedVersion }
      : {}),
    ...(input.error !== undefined
      ? { reason: input.error }
      : staleReason !== undefined
        ? { reason: staleReason }
        : {}),
    safe_auto_apply: input.safeAutoApply,
  };
}

function summarizeHookStatus(locations: IntegrationLocation[]): IntegrationCheck["status"] {
  if (locations.some((loc) => loc.status === "installed")) return "installed";
  if (locations.some((loc) => loc.status === "stale")) return "stale";
  if (locations.some((loc) => loc.status === "missing")) return "missing";
  if (locations.every((loc) => loc.status === "not_required")) return "not_required";
  if (locations.every((loc) => loc.status === "unsupported")) return "unsupported";
  if (locations.some((loc) => loc.status === "blocked")) return "blocked";
  return summarizeStatus(locations);
}

function hookTargetScope(
  runtimeId: RuntimeId,
  requestedScope: IntegrationScope,
): IntegrationScope {
  return integrationScopeForHookScope(
    runtimeId,
    hookInstallScopeFor(runtimeId, requestedScope),
  );
}

function locationScopeForChosenScope(
  runtimeId: RuntimeId,
  chosenScope: IntegrationScope,
): IntegrationScope {
  if (runtimeId === "codex") return "user";
  return chosenScope;
}

export function summarizeHookStatusForScope(
  locations: IntegrationLocation[],
  chosenScope: IntegrationScope | undefined,
  runtimeId: RuntimeId,
): IntegrationCheck["status"] {
  if (chosenScope === undefined) return summarizeHookStatus(locations);
  const locationScope = locationScopeForChosenScope(runtimeId, chosenScope);
  const chosenLocations = locations.filter(
    (location) => location.scope === locationScope,
  );
  if (chosenLocations.length === 0) return "missing";
  return summarizeHookStatus(chosenLocations);
}

function summarizeMcpCheckForScope(
  check: IntegrationCheck,
  chosenScope: IntegrationScope | undefined,
  runtimeId: RuntimeId,
): IntegrationCheck {
  if (chosenScope === undefined) return check;
  const locationScope = locationScopeForChosenScope(runtimeId, chosenScope);
  const chosenLocations = check.locations.filter(
    (location) => location.scope === locationScope,
  );
  return {
    ...check,
    status:
      chosenLocations.length === 0 ? "missing" : summarizeStatus(chosenLocations),
  };
}

function hookLocationForScope(
  hooks: IntegrationCheck,
  scope: IntegrationScope,
): IntegrationLocation | undefined {
  return hooks.locations.find((location) => location.scope === scope);
}

function shouldApplyHookLocation(location: IntegrationLocation | undefined): boolean {
  return location?.status === "missing" || location?.status === "stale";
}

async function applyMcp(input: McpApplyInput) {
  if (input.runtimeId === "claude") return applyClaudeMcp(input);
  if (input.runtimeId === "codex") return applyCodexMcp(input);
  if (input.runtimeId === "opencode") return applyOpencodeMcp(input);
  throw new Error(`unsupported runtime_id: ${input.runtimeId}`);
}

async function detectHooks(input: {
  runtimeId: RuntimeId;
  projectRoot: string;
  participantId: string;
  userParticipantId?: string;
  env?: NodeJS.ProcessEnv;
  chosenScope?: IntegrationScope;
}): Promise<IntegrationCheck> {
  if (
    input.runtimeId !== "claude" &&
    input.runtimeId !== "codex" &&
    input.runtimeId !== "opencode"
  ) {
    const locations: IntegrationLocation[] = [
      {
        scope: "project",
        path: input.projectRoot,
        status: "unsupported",
        reason: `unsupported runtime_id: ${input.runtimeId}`,
        safe_auto_apply: false,
      },
    ];
    return {
      status: summarizeHookStatusForScope(
        locations,
        input.chosenScope,
        input.runtimeId,
      ),
      expected_version: FMARK_HOOK_INSTALL_VERSION,
      locations,
    };
  }
  try {
    const detected = await checkHookInstallStatus({
      runtimeId: input.runtimeId,
      participantId: input.participantId,
      userParticipantId: input.userParticipantId,
      projectRoot: input.projectRoot,
      env: input.env,
    });
    const locations =
      detected.locations?.map((location) =>
        hookIntegrationLocation({
          scope: location.scope === "global" ? "user" : "project",
          path: location.configPath,
          status:
            location.expectedEntries.length === 0
              ? "not_required"
              : location.error !== undefined
                ? "blocked"
                : location.status ??
                  (location.installed
                    ? "installed"
                    : location.detectedEntries.length > 0
                      ? "stale"
                      : "missing"),
          expectedVersion: location.expectedVersion,
          detectedVersion: location.detectedVersion,
          error: location.error,
          safeAutoApply:
            location.error === undefined && location.expectedEntries.length > 0,
        }),
      ) ?? [
        hookIntegrationLocation({
          scope: defaultScope(input.runtimeId),
          path: detected.configPath,
          status:
            detected.expectedEntries.length === 0
              ? "not_required"
              : detected.status ??
                (detected.installed
                  ? "installed"
                  : detected.detectedEntries.length > 0
                    ? "stale"
                    : "missing"),
          expectedVersion: detected.expectedVersion,
          detectedVersion: detected.detectedVersion,
          safeAutoApply: detected.expectedEntries.length > 0,
        }),
      ];
    return {
      status: summarizeHookStatusForScope(
        locations,
        input.chosenScope,
        input.runtimeId,
      ),
      expected_version: detected.expectedVersion ?? FMARK_HOOK_INSTALL_VERSION,
      locations,
    };
  } catch (err) {
    const locations: IntegrationLocation[] = [
      {
        scope: "project",
        path: input.projectRoot,
        status: "blocked",
        reason: err instanceof Error ? err.message : String(err),
        safe_auto_apply: false,
      },
    ];
    return {
      status: summarizeHookStatusForScope(
        locations,
        input.chosenScope,
        input.runtimeId,
      ),
      expected_version: FMARK_HOOK_INSTALL_VERSION,
      locations,
    };
  }
}

export async function preflightIntegration(input: {
  runtimeId: RuntimeId;
  executable?: string;
  projectRoot: string;
  participantId?: string;
  userParticipantId?: string;
  env?: NodeJS.ProcessEnv;
  chosenScope?: IntegrationScope;
}): Promise<IntegrationPreflightResponse> {
  const env = input.env ?? process.env;
  const participantId = input.participantId ?? "ag-preflight";
  const resolvedChosenScope = input.chosenScope ?? defaultScope(input.runtimeId);
  const chosenHookScope =
    input.chosenScope === undefined
      ? undefined
      : hookTargetScope(input.runtimeId, input.chosenScope);
  const runtime = await probeRuntime(input.runtimeId, env, input.executable);
  const mcp = await detectMcp({
    runtimeId: input.runtimeId,
    projectRoot: input.projectRoot,
    env,
    chosenScope: input.chosenScope,
  });
  const hooks = await detectHooks({
    runtimeId: input.runtimeId,
    projectRoot: input.projectRoot,
    participantId,
    userParticipantId: input.userParticipantId,
    env,
    chosenScope: chosenHookScope,
  });
  return {
    runtime,
    mcp,
    hooks,
    chosen_scope: resolvedChosenScope,
    can_apply:
      runtime.available &&
      mcp.status !== "blocked" &&
      mcp.status !== "unsupported" &&
      hooks.status !== "blocked" &&
      hooks.status !== "unsupported",
  };
}

export async function applyIntegration(input: {
  runtimeId: RuntimeId;
  executable?: string;
  scope?: IntegrationScope;
  projectRoot: string;
  participantId?: string;
  userParticipantId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<IntegrationApplyResponse> {
  const env = input.env ?? process.env;
  const runtime = await probeRuntime(input.runtimeId, env, input.executable);
  if (!runtime.available) {
    throw new Error(runtime.reason ?? `${runtime.executable} is not available`);
  }
  const requestedScope = input.scope ?? defaultScope(input.runtimeId);
  const chosenHookScope = hookInstallScopeFor(input.runtimeId, requestedScope);
  const targetHookScope = hookTargetScope(input.runtimeId, requestedScope);
  const appliedMcp = await applyMcp({
    runtimeId: input.runtimeId,
    scope: requestedScope,
    projectRoot: input.projectRoot,
    env,
  });
  const beforeHooks = await detectHooks({
    runtimeId: input.runtimeId,
    projectRoot: input.projectRoot,
    participantId: input.participantId ?? "ag-preflight",
    userParticipantId: input.userParticipantId,
    env,
    chosenScope: targetHookScope,
  });
  const beforeHookLocation = hookLocationForScope(beforeHooks, targetHookScope);
  let hooksChanged = false;
  let appliedHooksScope: IntegrationScope | undefined;
  if (shouldApplyHookLocation(beforeHookLocation)) {
    const applied = await applyAutomaticHookInstall({
      runtimeId: input.runtimeId,
      participantId: input.participantId,
      userParticipantId: input.userParticipantId,
      projectRoot: input.projectRoot,
      scope: chosenHookScope,
      env,
    });
    hooksChanged = applied.changed;
    appliedHooksScope = targetHookScope;
  }
  const reconciled = await reconcileHookScopes({
    runtimeId: input.runtimeId,
    chosenHookScope,
    projectRoot: input.projectRoot,
    env,
  });
  hooksChanged = hooksChanged || reconciled.removed.length > 0;
  const after = await preflightIntegration({
    runtimeId: input.runtimeId,
    executable: input.executable,
    participantId: input.participantId,
    userParticipantId: input.userParticipantId,
    projectRoot: input.projectRoot,
    env,
    chosenScope: requestedScope,
  });
  const appliedHooksLocation =
    appliedHooksScope === undefined
      ? undefined
      : hookLocationForScope(after.hooks, appliedHooksScope);
  return {
    ...after,
    applied: {
      mcp: appliedMcp.location,
      ...(appliedHooksLocation !== undefined ? { hooks: appliedHooksLocation } : {}),
    },
    changed: appliedMcp.changed || hooksChanged,
    mcp_changed: appliedMcp.changed,
    hooks_changed: hooksChanged,
  };
}
