import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { IntegrationLocation } from "@f-mark/shared";
import {
  FMARK_MCP_INSTALL_VERSION,
  codexHome,
  fmarkMcpCommandSpec,
  makeCheck,
  type McpApplyInput,
  type McpDetectInput,
} from "./types.js";

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

function codexFmarkBlockValue(text: string, key: string): string | undefined {
  const block = text.match(
    /\[mcp_servers\.fmark\]\s*([\s\S]*?)(?=\n\s*\[|$)/,
  )?.[1];
  return block?.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, "m"))?.[1];
}

function arraysEqual(a: string[] | undefined, b: string[]): boolean {
  return (
    a !== undefined &&
    a.length === b.length &&
    a.every((item, index) => item === b[index])
  );
}

function codexStatus(
  text: string,
  expected?: { command: string; args: string[] },
): {
  status: "missing" | "installed" | "stale";
  version?: string;
  reason?: string;
} {
  if (!text.includes("[mcp_servers.fmark]")) {
    if (text.includes("[mcp_servers.fmark")) return { status: "stale" };
    return { status: "missing" };
  }
  const match = text.match(/F_MARK_MCP_VERSION\s*=\s*"([^"]+)"/);
  const version = match?.[1];
  if (version === FMARK_MCP_INSTALL_VERSION && expected !== undefined) {
    const command = parseTomlString(codexFmarkBlockValue(text, "command"));
    const args = parseTomlStringArray(codexFmarkBlockValue(text, "args"));
    if (command !== expected.command || !arraysEqual(args, expected.args)) {
      return {
        status: "stale",
        version,
        reason: "fmark MCP command does not match this project path",
      };
    }
  }
  return {
    status: version === FMARK_MCP_INSTALL_VERSION ? "installed" : "stale",
    version,
  };
}

async function detectCodexToml(
  scope: "project" | "user",
  path: string,
  safeAutoApply: boolean,
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
  if (loaded.text.includes("[mcp_servers.fmark") && !loaded.text.includes("[mcp_servers.fmark]")) {
    return {
      scope,
      path,
      status: "blocked",
      reason: "invalid TOML: malformed fmark MCP section",
      safe_auto_apply: false,
    };
  }
  const current = codexStatus(loaded.text, undefined);
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
  const userLocation = await detectCodexToml("user", userPath, true);
  if (
    userLocation.status !== "blocked" &&
    userLocation.status !== "missing"
  ) {
    const loaded = await readToml(userPath);
    if (loaded.ok && loaded.exists) {
      const current = codexStatus(
        loaded.text,
        fmarkMcpCommandSpec(input.projectRoot, input.env),
      );
      userLocation.status = current.status;
      userLocation.version = current.version;
      userLocation.reason = current.reason;
    }
  }
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

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlTableName(line: string): string | null {
  const match = line.match(/^\s*\[([^[\]][^\]]*)\]\s*(?:#.*)?$/);
  return match?.[1]?.trim() ?? null;
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
    "",
    "[mcp_servers.fmark.env]",
    `F_MARK_MCP_VERSION = ${tomlString(FMARK_MCP_INSTALL_VERSION)}`,
  ].join("\n");
}

function upsertCodexMcpBlock(
  text: string,
  spec: { command: string; args: string[] },
): string {
  const stripped = removeTomlTables(
    text,
    (table) => table === "mcp_servers.fmark" || table.startsWith("mcp_servers.fmark."),
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
  const spec = fmarkMcpCommandSpec(input.projectRoot, input.env);
  const path = join(codexHome(input.env), "config.toml");
  const before = await readToml(path);
  const beforeText = before.ok && before.exists ? before.text : null;
  if (!before.ok) {
    throw new Error(`blocked Codex config ${path}: ${before.error}`);
  }
  const existing = before.exists ? before.text : "";
  const next = ensureCodexProjectTrusted(
    upsertCodexMcpBlock(existing, spec),
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
