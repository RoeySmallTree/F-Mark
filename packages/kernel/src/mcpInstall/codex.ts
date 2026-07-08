import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { IntegrationLocation } from "@f-mark/shared";
import { FMARK_MCP_TOOL_NAMES } from "../mcp/tools.js";
import {
  FMARK_MCP_INSTALL_VERSION,
  codexHome,
  fmarkMcpCommandSpec,
  makeCheck,
  type McpApplyInput,
  type McpDetectInput,
} from "./types.js";
import {
  classifyFmarkMcpDefinition,
  summarizeFmarkDefinitions,
  type FmarkMcpDefinition,
} from "./ownership.js";

const CODEX_FMARK_MCP_SERVER_NAME = "fmark";
const CODEX_MCP_TOOL_APPROVAL_MODE = "approve";

async function readToml(path: string): Promise<
  | { ok: true; text: string; exists: true }
  | { ok: true; text: ""; exists: false }
  | { ok: false; error: string; exists: true }
> {
  try {
    return { ok: true, text: await readFile(path, "utf8"), exists: true };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: true, text: "", exists: false };
    }
    return { ok: false, error: (err as Error).message, exists: true };
  }
}

function parseTomlString(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as string;
  } catch {
    return undefined;
  }
}

function parseTomlStringArray(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const matches = [...raw.matchAll(/"((?:\\.|[^"])*)"/g)];
  if (matches.length === 0) return [];
  const out: string[] = [];
  for (const match of matches) {
    const parsed = parseTomlString(`"${match[1] ?? ""}"`);
    if (parsed === undefined) return undefined;
    out.push(parsed);
  }
  return out;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function codexFmarkBlockValue(text: string, key: string): string | undefined {
  const block = text.match(
    /\[mcp_servers\.fmark\]\s*([\s\S]*?)(?=\n\s*\[|$)/,
  )?.[1];
  return block?.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, "m"))?.[1];
}

function codexFmarkToolBlockValue(
  text: string,
  toolName: string,
  key: string,
): string | undefined {
  const block = text.match(
    new RegExp(
      `\\[mcp_servers\\.fmark\\.tools\\.${escapeRegExp(toolName)}\\]\\s*([\\s\\S]*?)(?=\\n\\s*\\[|$)`,
    ),
  )?.[1];
  return block?.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, "m"))?.[1];
}

function codexFmarkApprovalConfigValue(toolName: string): string {
  return `mcp_servers.${CODEX_FMARK_MCP_SERVER_NAME}.tools.${toolName}.approval_mode=${tomlString(CODEX_MCP_TOOL_APPROVAL_MODE)}`;
}

export function codexFmarkMcpApprovalConfigArgs(): string[] {
  return FMARK_MCP_TOOL_NAMES.flatMap((toolName) => [
    "-c",
    codexFmarkApprovalConfigValue(toolName),
  ]);
}

function missingCodexFmarkToolApprovals(text: string): string[] {
  const defaultMode = parseTomlString(
    codexFmarkBlockValue(text, "default_tools_approval_mode"),
  );
  if (defaultMode === CODEX_MCP_TOOL_APPROVAL_MODE) return [];

  return FMARK_MCP_TOOL_NAMES.filter((toolName) => {
    const mode = parseTomlString(
      codexFmarkToolBlockValue(text, toolName, "approval_mode"),
    );
    return mode !== CODEX_MCP_TOOL_APPROVAL_MODE;
  });
}

function parseTomlDottedKey(value: string): string[] | null {
  const out: string[] = [];
  let i = 0;
  while (i < value.length) {
    while (/\s/.test(value[i] ?? "")) i++;
    if (value[i] === '"') {
      let raw = '"';
      i++;
      let escaped = false;
      for (; i < value.length; i++) {
        const ch = value[i]!;
        raw += ch;
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          i++;
          break;
        }
      }
      const parsed = parseTomlString(raw);
      if (parsed === undefined) return null;
      out.push(parsed);
    } else {
      const start = i;
      while (i < value.length && value[i] !== ".") i++;
      const segment = value.slice(start, i).trim();
      if (segment.length === 0) return null;
      out.push(segment);
    }
    while (/\s/.test(value[i] ?? "")) i++;
    if (i >= value.length) break;
    if (value[i] !== ".") return null;
    i++;
  }
  return out;
}

function codexMcpTable(tableName: string): { name: string; child: string[] } | null {
  const parts = parseTomlDottedKey(tableName);
  if (parts === null || parts[0] !== "mcp_servers" || parts[1] === undefined) {
    return null;
  }
  return { name: parts[1], child: parts.slice(2) };
}

function tableValue(block: string, key: string): string | undefined {
  return block.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, "m"))?.[1];
}

function tomlTableBlocks(text: string): Array<{ name: string; body: string }> {
  const lines = text.split("\n");
  const blocks: Array<{ name: string; body: string[] }> = [];
  let current: { name: string; body: string[] } | null = null;
  for (const line of lines) {
    const name = tomlTableName(line);
    if (name !== null) {
      current = { name, body: [] };
      blocks.push(current);
      continue;
    }
    current?.body.push(line);
  }
  return blocks.map((block) => ({ name: block.name, body: block.body.join("\n") }));
}

function withoutPathArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--path") {
      index++;
      continue;
    }
    if (arg?.startsWith("--path=")) continue;
    if (arg !== undefined) out.push(arg);
  }
  return out;
}

function codexGlobalMcpCommandSpec(
  projectRoot: string,
  env: NodeJS.ProcessEnv,
): { command: string; args: string[] } {
  const spec = fmarkMcpCommandSpec(projectRoot, env);
  return { command: spec.command, args: withoutPathArgs(spec.args) };
}

function inspectCodexFmarkMcpServers(
  text: string,
  projectRoot: string,
  expected?: { command: string; args: string[] },
): FmarkMcpDefinition[] {
  const servers = new Map<string, Record<string, unknown>>();
  const ensure = (name: string): Record<string, unknown> => {
    const existing = servers.get(name);
    if (existing !== undefined) return existing;
    const next: Record<string, unknown> = {};
    servers.set(name, next);
    return next;
  };
  for (const block of tomlTableBlocks(text)) {
    const table = codexMcpTable(block.name);
    if (table === null) continue;
    const server = ensure(table.name);
    if (table.child.length === 0) {
      const command = parseTomlString(tableValue(block.body, "command"));
      if (command !== undefined) server.command = command;
      const args = parseTomlStringArray(tableValue(block.body, "args"));
      if (args !== undefined) server.args = args;
      continue;
    }
    if (table.child.length === 1 && table.child[0] === "env") {
      const version = parseTomlString(tableValue(block.body, "F_MARK_MCP_VERSION"));
      if (version !== undefined) {
        server.env = { F_MARK_MCP_VERSION: version };
      }
    }
  }
  const definitions: FmarkMcpDefinition[] = [];
  for (const [name, server] of servers) {
    const command = typeof server.command === "string" ? server.command : undefined;
    const args = Array.isArray(server.args) ? (server.args as string[]) : [];
    const definition = classifyFmarkMcpDefinition({
      name,
      server,
      projectRoot,
      expected,
      commandVector: { command, args },
      envKeys: ["env"],
    });
    if (definition !== null) definitions.push(definition);
  }
  return definitions;
}

function codexStatus(
  text: string,
  projectRoot: string,
  expected?: { command: string; args: string[] },
): {
  status: "missing" | "installed" | "stale";
  version?: string;
  reason?: string;
} {
  const current = summarizeFmarkDefinitions(
    inspectCodexFmarkMcpServers(text, projectRoot, expected),
  );
  if (current.status !== "installed") return current;
  const missingApprovals = missingCodexFmarkToolApprovals(text);
  if (missingApprovals.length > 0) {
    return {
      status: "stale",
      version: current.version,
      reason: `${missingApprovals.length} fmark MCP tool${missingApprovals.length === 1 ? "" : "s"} missing Codex approval_mode="${CODEX_MCP_TOOL_APPROVAL_MODE}"`,
    };
  }
  return current;
}

async function detectCodexToml(
  scope: "project" | "user",
  path: string,
  safeAutoApply: boolean,
  projectRoot: string,
  expected?: { command: string; args: string[] },
): Promise<IntegrationLocation> {
  const loaded = await readToml(path);
  if (!loaded.ok) {
    return {
      scope,
      path,
      status: "blocked",
      reason: loaded.error,
      safe_auto_apply: false,
    };
  }
  if (!loaded.exists) {
    return { scope, path, status: "missing", safe_auto_apply: safeAutoApply };
  }
  if (hasMalformedFmarkMcpTable(loaded.text)) {
    return {
      scope,
      path,
      status: "blocked",
      reason: "invalid TOML: malformed fmark MCP section",
      safe_auto_apply: false,
    };
  }
  const current = codexStatus(loaded.text, projectRoot, expected);
  return {
    scope,
    path,
    status: current.status,
    version: current.version,
    reason: current.reason,
    safe_auto_apply: safeAutoApply,
  };
}

export async function detectCodexMcp(input: McpDetectInput) {
  const userPath = join(codexHome(input.env), "config.toml");
  const userLocation = await detectCodexToml(
	    "user",
	    userPath,
	    true,
	    input.projectRoot,
	    codexGlobalMcpCommandSpec(input.projectRoot, input.env),
	  );
  return makeCheck([
    {
      scope: "project",
      path: join(input.projectRoot, ".codex/config.toml"),
      status: "unsupported",
      reason: "Codex CLI 0.133.0 MCP add/list uses CODEX_HOME config, not project .codex/config.toml",
      safe_auto_apply: false,
    },
    userLocation,
  ]);
}

function tomlTableName(line: string): string | null {
  const match = line.match(/^\s*\[([^[\]][^\]]*)\]\s*(?:#.*)?$/);
  return match?.[1]?.trim() ?? null;
}

function hasMalformedFmarkMcpTable(text: string): boolean {
  return text.split("\n").some((line) => {
    if (!line.trimStart().startsWith("[mcp_servers.fmark")) return false;
    return tomlTableName(line) === null;
  });
}

function removeTomlTables(
  text: string,
  shouldRemove: (tableName: string) => boolean,
): { text: string; changed: boolean } {
  const lines = text.split("\n");
  const out: string[] = [];
  let skipping = false;
  let changed = false;
  for (const line of lines) {
    const table = tomlTableName(line);
    if (table !== null) {
      skipping = shouldRemove(table);
    }
    if (skipping) {
      changed = true;
    } else {
      out.push(line);
    }
  }
  return { text: out.join("\n").replace(/\n{3,}$/g, "\n\n"), changed };
}

function renderCodexMcpBlock(spec: { command: string; args: string[] }): string {
  return [
    "[mcp_servers.fmark]",
    `command = ${tomlString(spec.command)}`,
    `args = [${spec.args.map(tomlString).join(", ")}]`,
    `default_tools_approval_mode = ${tomlString("prompt")}`,
    "",
    "[mcp_servers.fmark.env]",
    `F_MARK_MCP_VERSION = ${tomlString(FMARK_MCP_INSTALL_VERSION)}`,
    "",
    ...FMARK_MCP_TOOL_NAMES.flatMap((toolName) => [
      `[mcp_servers.fmark.tools.${toolName}]`,
      `approval_mode = ${tomlString(CODEX_MCP_TOOL_APPROVAL_MODE)}`,
      "",
    ]),
  ].join("\n");
}

function upsertCodexMcpBlock(
  text: string,
  spec: { command: string; args: string[] },
  projectRoot: string,
): string {
  const ownedNames = new Set(
    inspectCodexFmarkMcpServers(text, projectRoot, spec).map(
      (definition) => definition.name,
    ),
  );
  ownedNames.add("fmark");
  const stripped = removeTomlTables(
    text,
    (table) => {
      const mcpTable = codexMcpTable(table);
      return mcpTable !== null && ownedNames.has(mcpTable.name);
    },
  ).text.trimEnd();
  const block = renderCodexMcpBlock(spec);
  return `${stripped}${stripped.length > 0 ? "\n\n" : ""}${block}\n`;
}

function projectTrustTableName(projectRoot: string): string {
  return `projects.${tomlString(projectRoot)}`;
}

function ensureCodexProjectTrusted(text: string, projectRoot: string): string {
  const tableName = projectTrustTableName(projectRoot);
  const lines = text.split("\n");
  const out: string[] = [];
  let inProject = false;
  let sawProject = false;
  let sawTrustLevel = false;
  for (const line of lines) {
    const table = tomlTableName(line);
    if (table !== null) {
      if (inProject && !sawTrustLevel) {
        out.push('trust_level = "trusted"');
      }
      inProject = table === tableName;
      sawProject = sawProject || inProject;
      sawTrustLevel = false;
    }
    if (inProject && /^\s*trust_level\s*=/.test(line)) {
      out.push('trust_level = "trusted"');
      sawTrustLevel = true;
      continue;
    }
    out.push(line);
  }
  if (inProject && !sawTrustLevel) {
    out.push('trust_level = "trusted"');
  }
  if (!sawProject) {
    const trimmed = out.join("\n").trimEnd();
    return `${trimmed}${trimmed.length > 0 ? "\n\n" : ""}[${tableName}]\ntrust_level = "trusted"\n`;
  }
  return out.join("\n");
}

export async function applyCodexMcp(input: McpApplyInput) {
  if (input.scope !== "user") {
    throw new Error(
      "Codex MCP apply supports user scope only; project .codex/config.toml is not loaded by codex mcp list in this CLI version",
    );
  }
  const spec = codexGlobalMcpCommandSpec(input.projectRoot, input.env);
  const path = join(codexHome(input.env), "config.toml");
  const before = await readToml(path);
  const beforeText = before.ok && before.exists ? before.text : null;
  if (!before.ok) {
    throw new Error(`blocked Codex config ${path}: ${before.error}`);
  }
  const existing = before.exists ? before.text : "";
  if (hasMalformedFmarkMcpTable(existing)) {
    throw new Error(`blocked Codex config ${path}: invalid TOML: malformed fmark MCP section`);
  }
  const next = ensureCodexProjectTrusted(
    upsertCodexMcpBlock(existing, spec, input.projectRoot),
    input.projectRoot,
  );
  if (next !== existing) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, next, "utf8");
  }
  return {
    changed: beforeText !== next,
    location: {
      scope: "user" as const,
      path,
      status: "installed" as const,
      version: FMARK_MCP_INSTALL_VERSION,
      safe_auto_apply: true,
    },
  };
}
