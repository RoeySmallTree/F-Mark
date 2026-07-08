import { basename } from "node:path";
import { FMARK_MCP_INSTALL_VERSION } from "./types.js";

export type FmarkMcpDefinitionStatus = "installed" | "stale";

export interface FmarkMcpDefinition {
  name: string;
  status: FmarkMcpDefinitionStatus;
  version?: string;
  reason?: string;
  commandPath?: string;
}

export interface FmarkMcpExpectedCommand {
  command: string;
  args: string[];
}

export interface FmarkMcpCommandVector {
  command?: string;
  args: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((item) => typeof item === "string")
    ? (value as string[])
    : null;
}

function arraysEqual(a: string[] | undefined, b: string[]): boolean {
  return (
    a !== undefined &&
    a.length === b.length &&
    a.every((item, index) => item === b[index])
  );
}

function envVersion(value: unknown): string | undefined {
  const env = asRecord(value);
  const raw = env?.F_MARK_MCP_VERSION;
  return typeof raw === "string" ? raw : undefined;
}

function fmarkMcpVersionFromServer(
  server: unknown,
  envKeys: string[],
): string | undefined {
  const value = asRecord(server);
  if (value === null) return undefined;
  for (const key of envKeys) {
    const version = envVersion(value[key]);
    if (version !== undefined) return version;
  }
  return undefined;
}

function pathArg(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === "--path") return args[i + 1];
    if (arg.startsWith("--path=")) return arg.slice("--path=".length);
  }
  return undefined;
}

function fmarkCommandName(command: string): boolean {
  const name = basename(command.replace(/\\/g, "/"));
  return name === "f-mark" || name === "fmark-dev";
}

function commandOwnsProject(
  vector: FmarkMcpCommandVector | null,
  projectRoot: string,
): { owned: boolean; commandPath?: string } {
  if (vector?.command === undefined) return { owned: false };
  const commandPath = pathArg(vector.args);
  return {
    owned:
      fmarkCommandName(vector.command) &&
      vector.args.includes("mcp") &&
      commandPath === projectRoot,
    commandPath,
  };
}

function commandMatchesExpected(
  vector: FmarkMcpCommandVector | null,
  expected?: FmarkMcpExpectedCommand,
): boolean {
  if (expected === undefined) return true;
  return vector?.command === expected.command && arraysEqual(vector.args, expected.args);
}

export function claudeCommandVector(
  server: unknown,
): FmarkMcpCommandVector | null {
  const value = asRecord(server);
  if (value === null) return null;
  const command = typeof value.command === "string" ? value.command : undefined;
  const args = stringArray(value.args) ?? [];
  return { command, args };
}

export function opencodeCommandVector(
  server: unknown,
): FmarkMcpCommandVector | null {
  const value = asRecord(server);
  if (value === null) return null;
  const command = stringArray(value.command);
  if (command === null || command.length === 0) return null;
  const [head, ...args] = command;
  return { command: head, args };
}

export function classifyFmarkMcpDefinition(input: {
  name: string;
  server: unknown;
  projectRoot: string;
  expected?: FmarkMcpExpectedCommand;
  commandVector: FmarkMcpCommandVector | null;
  envKeys: string[];
}): FmarkMcpDefinition | null {
  const version = fmarkMcpVersionFromServer(input.server, input.envKeys);
  const shape = commandOwnsProject(input.commandVector, input.projectRoot);
  const owned =
    input.name === "fmark" || version !== undefined || shape.owned;
  if (!owned) return null;

  const canonical = input.name === "fmark";
  const currentVersion = version === FMARK_MCP_INSTALL_VERSION;
  if (!canonical) {
    return {
      name: input.name,
      status: "stale",
      version,
      reason: "F-Mark MCP alias",
      commandPath: shape.commandPath,
    };
  }
  if (!currentVersion) {
    return {
      name: input.name,
      status: "stale",
      version,
      reason: version === undefined ? "legacy F-Mark MCP definition" : "stale F-Mark MCP version",
      commandPath: shape.commandPath,
    };
  }
  if (
    shape.commandPath !== undefined &&
    shape.commandPath !== input.projectRoot
  ) {
    return {
      name: input.name,
      status: "stale",
      version,
      reason: "fmark MCP project path does not match this project",
      commandPath: shape.commandPath,
    };
  }
  if (!commandMatchesExpected(input.commandVector, input.expected)) {
	  return {
	    name: input.name,
	    status: "stale",
	    version,
	    reason: "fmark MCP command does not match the expected command",
	    commandPath: shape.commandPath,
	  };
  }
  return {
    name: input.name,
    status: "installed",
    version,
    commandPath: shape.commandPath,
  };
}

export function inspectClaudeFmarkMcpServers(input: {
  servers: Record<string, unknown> | null;
  projectRoot: string;
  expected?: FmarkMcpExpectedCommand;
}): FmarkMcpDefinition[] {
  if (input.servers === null) return [];
  const out: FmarkMcpDefinition[] = [];
  for (const [name, server] of Object.entries(input.servers)) {
    const definition = classifyFmarkMcpDefinition({
      name,
      server,
      projectRoot: input.projectRoot,
      expected: input.expected,
      commandVector: claudeCommandVector(server),
      envKeys: ["env"],
    });
    if (definition !== null) out.push(definition);
  }
  return out;
}

export function inspectOpencodeFmarkMcpServers(input: {
  servers: Record<string, unknown> | null;
  projectRoot: string;
  expected?: FmarkMcpExpectedCommand;
}): FmarkMcpDefinition[] {
  if (input.servers === null) return [];
  const out: FmarkMcpDefinition[] = [];
  for (const [name, server] of Object.entries(input.servers)) {
    const definition = classifyFmarkMcpDefinition({
      name,
      server,
      projectRoot: input.projectRoot,
      expected: input.expected,
      commandVector: opencodeCommandVector(server),
      envKeys: ["environment", "env"],
    });
    if (definition !== null) out.push(definition);
  }
  return out;
}

export function ownedFmarkMcpNames(definitions: FmarkMcpDefinition[]): Set<string> {
  return new Set(definitions.map((definition) => definition.name));
}

export function summarizeFmarkDefinitions(
  definitions: FmarkMcpDefinition[],
): {
  status: "installed" | "stale" | "missing";
  version?: string;
  reason?: string;
} {
  if (definitions.length === 0) return { status: "missing" };
  const canonical = definitions.find((definition) => definition.name === "fmark");
  if (definitions.length > 1) {
    return {
      status: "stale",
      version: canonical?.version ?? definitions[0]?.version,
      reason: `${definitions.length} F-Mark MCP definitions found`,
    };
  }
  const only = definitions[0]!;
  return {
    status: only.status,
    version: only.version,
    reason: only.reason,
  };
}
