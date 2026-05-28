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
import { checkHookInstallStatus } from "../hooksInstall/index.js";
import { applyAutomaticHookInstall } from "../hooksInstall/index.js";
import { FMARK_HOOK_INSTALL_VERSION } from "../hooksInstall/command.js";
import { applyClaudeMcp, detectClaudeMcp } from "./claude.js";
import { applyCodexMcp, detectCodexMcp } from "./codex.js";
import { applyGeminiMcp, detectGeminiMcp } from "./gemini.js";
import { applyOpencodeMcp, detectOpencodeMcp } from "./opencode.js";
import {
  makeCheck,
  runtimeUnavailable,
  summarizeStatus,
  type McpApplyInput,
  type McpDetectInput,
} from "./types.js";

function executableFor(runtimeId: RuntimeId): string {
  return runtimeId === "claude" ||
    runtimeId === "codex" ||
    runtimeId === "gemini" ||
    runtimeId === "opencode"
    ? runtimeId
    : String(runtimeId);
}

function execVersion(executable: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      executable,
      ["--version"],
      { env, timeout: 10_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve((stdout || stderr).toString().trim());
      },
    );
    child.stdin?.end();
  });
}

async function probeRuntime(
  runtimeId: RuntimeId,
  env: NodeJS.ProcessEnv,
): Promise<RuntimeCapability> {
  const executable = executableFor(runtimeId);
  try {
    return {
      runtime_id: runtimeId,
      executable,
      version: await execVersion(executable, env),
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

async function detectMcp(input: McpDetectInput): Promise<IntegrationCheck> {
  if (input.runtimeId === "claude") return detectClaudeMcp(input);
  if (input.runtimeId === "codex") return detectCodexMcp(input);
  if (input.runtimeId === "gemini") return detectGeminiMcp(input);
  if (input.runtimeId === "opencode") return detectOpencodeMcp(input);
  return makeCheck([
    {
      scope: "project",
      path: input.projectRoot,
      status: "unsupported",
      reason: `unsupported runtime_id: ${input.runtimeId}`,
      safe_auto_apply: false,
    },
  ]);
}

function defaultScope(runtimeId: RuntimeId): IntegrationScope {
  if (runtimeId === "codex") return "user";
  return "project";
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
  const staleReason =
    input.status === "stale"
      ? `installed hook ${input.detectedVersion ?? "legacy"}; expected ${
          input.expectedVersion ?? FMARK_HOOK_INSTALL_VERSION
        }`
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
  if (runtimeId === "codex") return "user";
  return requestedScope === "user" ? "user" : "project";
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
  if (input.runtimeId === "gemini") return applyGeminiMcp(input);
  if (input.runtimeId === "opencode") return applyOpencodeMcp(input);
  throw new Error(`unsupported runtime_id: ${input.runtimeId}`);
}

async function detectHooks(input: {
  runtimeId: RuntimeId;
  projectRoot: string;
  participantId: string;
  userParticipantId?: string;
}): Promise<IntegrationCheck> {
  if (
    input.runtimeId !== "claude" &&
    input.runtimeId !== "codex" &&
    input.runtimeId !== "gemini" &&
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
      status: summarizeHookStatus(locations),
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
      status: summarizeHookStatus(locations),
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
      status: summarizeHookStatus(locations),
      expected_version: FMARK_HOOK_INSTALL_VERSION,
      locations,
    };
  }
}

export async function preflightIntegration(input: {
  runtimeId: RuntimeId;
  projectRoot: string;
  participantId?: string;
  userParticipantId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<IntegrationPreflightResponse> {
  const env = input.env ?? process.env;
  const participantId = input.participantId ?? "ag-preflight";
  const runtime = await probeRuntime(input.runtimeId, env);
  const mcp = await detectMcp({
    runtimeId: input.runtimeId,
    projectRoot: input.projectRoot,
    env,
  });
  const hooks = await detectHooks({
    runtimeId: input.runtimeId,
    projectRoot: input.projectRoot,
    participantId,
    userParticipantId: input.userParticipantId,
  });
  return {
    runtime,
    mcp,
    hooks,
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
  scope?: IntegrationScope;
  projectRoot: string;
  participantId?: string;
  userParticipantId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<IntegrationApplyResponse> {
  const env = input.env ?? process.env;
  const runtime = await probeRuntime(input.runtimeId, env);
  if (!runtime.available) {
    throw new Error(runtime.reason ?? `${runtime.executable} is not available`);
  }
  const appliedMcp = await applyMcp({
    runtimeId: input.runtimeId,
    scope: input.scope ?? defaultScope(input.runtimeId),
    projectRoot: input.projectRoot,
    env,
  });
  const requestedScope = input.scope ?? defaultScope(input.runtimeId);
  const targetHookScope = hookTargetScope(input.runtimeId, requestedScope);
  const beforeHooks = await detectHooks({
    runtimeId: input.runtimeId,
    projectRoot: input.projectRoot,
    participantId: input.participantId ?? "ag-preflight",
    userParticipantId: input.userParticipantId,
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
      scope: requestedScope === "user" ? "global" : "local",
    });
    hooksChanged = applied.changed;
    appliedHooksScope = targetHookScope;
  }
  const after = await preflightIntegration({
    runtimeId: input.runtimeId,
    participantId: input.participantId,
    userParticipantId: input.userParticipantId,
    projectRoot: input.projectRoot,
    env,
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
  };
}
