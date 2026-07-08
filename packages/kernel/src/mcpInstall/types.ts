import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
  IntegrationCheck,
  IntegrationLocation,
  IntegrationScope,
  IntegrationStatus,
  RuntimeCapability,
  RuntimeId,
} from "@f-mark/shared";

export const FMARK_MCP_INSTALL_VERSION = "phase5-stdio-v1";

export interface McpDetectInput {
  runtimeId: RuntimeId;
  projectRoot: string;
  env: NodeJS.ProcessEnv;
}

export interface McpApplyInput extends McpDetectInput {
  scope: IntegrationScope;
}

export interface McpApplyResult {
  location: IntegrationLocation;
  changed: boolean;
}

export interface FmarkMcpCommandSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface RuntimeProbeInput {
  runtimeId: RuntimeId;
  executable: string;
  env: NodeJS.ProcessEnv;
}

export function configHome(env: NodeJS.ProcessEnv): string {
  return env.XDG_CONFIG_HOME ?? join(env.HOME ?? process.cwd(), ".config");
}

export function userHome(env: NodeJS.ProcessEnv): string {
  return env.HOME ?? process.cwd();
}

export function codexHome(env: NodeJS.ProcessEnv): string {
  return env.CODEX_HOME ?? join(userHome(env), ".codex");
}

export function summarizeStatus(
  locations: IntegrationLocation[],
): IntegrationStatus {
  if (locations.some((loc) => loc.status === "blocked")) return "blocked";
  if (locations.some((loc) => loc.status === "installed")) return "installed";
  if (locations.some((loc) => loc.status === "stale")) return "stale";
  if (locations.every((loc) => loc.status === "unsupported")) return "unsupported";
  if (locations.every((loc) => loc.status === "not_required")) return "not_required";
  return "missing";
}

export function makeCheck(locations: IntegrationLocation[]): IntegrationCheck {
  return {
    status: summarizeStatus(locations),
    expected_version: FMARK_MCP_INSTALL_VERSION,
    locations,
  };
}

export function runtimeUnavailable(
  runtimeId: RuntimeId,
  executable: string,
  reason: string,
): RuntimeCapability {
  return {
    runtime_id: runtimeId,
    executable,
    available: false,
    reason,
  };
}

function parseArgsOverride(value: string | undefined): string[] | null {
  if (value === undefined || value.length === 0) return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // Fall through to whitespace splitting for simple manual overrides.
  }
  return value.split(/\s+/).filter(Boolean);
}

function isTypeScriptEntrypoint(path: string): boolean {
  return path.endsWith(".ts") || path.endsWith(".tsx");
}

function isFmarkCliEntrypoint(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return (
    /\/(?:src|dist)\/index\.(?:ts|js)$/.test(normalized) ||
    /\/bin\/f-mark\.js$/.test(normalized)
  );
}

function fmarkModuleEntrypoint(): string | null {
  const here = fileURLToPath(import.meta.url);
  if (here.endsWith(join("src", "mcpInstall", "types.ts"))) {
    return join(dirname(dirname(here)), "index.ts");
  }
  if (here.endsWith(join("dist", "mcpInstall", "types.js"))) {
    return join(dirname(dirname(here)), "index.js");
  }
  return null;
}

function localTsxCommand(entrypoint: string): string {
  const packageRoot = dirname(dirname(entrypoint));
  const binName = process.platform === "win32" ? "tsx.cmd" : "tsx";
  const local = join(packageRoot, "node_modules", ".bin", binName);
  return existsSync(local) ? local : "tsx";
}

export function fmarkMcpCommandSpec(
  projectRoot: string,
  env: NodeJS.ProcessEnv,
): FmarkMcpCommandSpec {
  const overrideCommand = env.F_MARK_MCP_COMMAND;
  const overrideArgs = parseArgsOverride(env.F_MARK_MCP_ARGS);
  if (overrideCommand !== undefined && overrideCommand.length > 0) {
    return {
      command: overrideCommand,
      args: [...(overrideArgs ?? []), "--path", projectRoot],
      env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
    };
  }

  const argvEntrypoint = process.argv[1];
  const entrypoint =
    argvEntrypoint !== undefined && isFmarkCliEntrypoint(argvEntrypoint)
      ? argvEntrypoint
      : fmarkModuleEntrypoint();
  if (entrypoint === null || entrypoint.length === 0) {
    return {
      command: "f-mark",
      args: ["mcp", "--path", projectRoot],
      env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
    };
  }

  return {
    command: isTypeScriptEntrypoint(entrypoint)
      ? localTsxCommand(entrypoint)
      : process.execPath,
    args: [entrypoint, "mcp", "--path", projectRoot],
    env: { F_MARK_MCP_VERSION: FMARK_MCP_INSTALL_VERSION },
  };
}
