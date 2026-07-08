import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import {
  claudeCommandVector,
  classifyFmarkMcpDefinition,
  opencodeCommandVector,
} from "./ownership.js";

function parseJsonOrJsonc(raw: string):
  | { ok: true; value: unknown }
  | { ok: false; error: string } {
  const errors: ParseError[] = [];
  const value = parseJsonc(raw, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0) {
    const first = errors[0]!;
    return { ok: false, error: `parse error at offset ${first.offset}: code ${first.error}` };
  }
  return { ok: true, value };
}

export async function readJsonConfig(path: string): Promise<
  | { ok: true; value: unknown; exists: true }
  | { ok: true; value: null; exists: false }
  | { ok: false; error: string; exists: true }
> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: true, value: null, exists: false };
    }
    return { ok: false, error: (err as Error).message, exists: true };
  }
  const parsed = parseJsonOrJsonc(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error, exists: true };
  return { ok: true, value: parsed.value, exists: true };
}

export function getObject(value: unknown, key: string): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const child = (value as Record<string, unknown>)[key];
  if (child === null || typeof child !== "object" || Array.isArray(child)) return null;
  return child as Record<string, unknown>;
}

function statusFromServer(
  server: unknown,
  expected?: { command: string; args: string[] },
): {
  status: "installed" | "stale" | "missing";
  version?: string;
  reason?: string;
} {
  if (server === null || typeof server !== "object" || Array.isArray(server)) {
    return { status: "missing" };
  }
  const pathIndex = expected?.args.lastIndexOf("--path") ?? -1;
  const projectRoot =
    expected !== undefined && pathIndex >= 0 ? expected.args[pathIndex + 1] ?? "" : "";
  const inspected = classifyFmarkMcpDefinition({
    name: "fmark",
    server,
    projectRoot,
    expected,
    commandVector: claudeCommandVector(server),
    envKeys: ["env"],
  });
  if (inspected !== null) {
    return {
      status: inspected.status,
      version: inspected.version,
      reason: inspected.reason,
    };
  }
  const value = server as Record<string, unknown>;
  const env = value.env;
  let version: string | undefined;
  if (env !== null && typeof env === "object" && !Array.isArray(env)) {
    const raw = (env as Record<string, unknown>).F_MARK_MCP_VERSION;
    if (typeof raw === "string") version = raw;
  }
  return {
    status: version === "phase5-stdio-v1" ? "installed" : "stale",
    version,
  };
}

function statusFromOpencodeServer(
  server: unknown,
  expected?: { command: string; args: string[] },
): {
  status: "installed" | "stale" | "missing";
  version?: string;
  reason?: string;
} {
  if (server === null || typeof server !== "object" || Array.isArray(server)) {
    return { status: "missing" };
  }
  const pathIndex = expected?.args.lastIndexOf("--path") ?? -1;
  const projectRoot =
    expected !== undefined && pathIndex >= 0 ? expected.args[pathIndex + 1] ?? "" : "";
  const inspected = classifyFmarkMcpDefinition({
    name: "fmark",
    server,
    projectRoot,
    expected,
    commandVector: opencodeCommandVector(server),
    envKeys: ["environment", "env"],
  });
  if (inspected !== null) {
    return {
      status: inspected.status,
      version: inspected.version,
      reason: inspected.reason,
    };
  }
  const value = server as Record<string, unknown>;
  // SDK type McpLocalConfig uses `environment`; permit legacy `env` for forward-compat.
  let envCandidate: unknown = value.environment;
  if (envCandidate === undefined || envCandidate === null || typeof envCandidate !== "object") {
    envCandidate = value.env;
  }
  let version: string | undefined;
  if (envCandidate !== null && typeof envCandidate === "object" && !Array.isArray(envCandidate)) {
    const raw = (envCandidate as Record<string, unknown>).F_MARK_MCP_VERSION;
    if (typeof raw === "string") version = raw;
  }
  return {
    status: version === "phase5-stdio-v1" ? "installed" : "stale",
    version,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function readJsonObjectForWrite(path: string): Promise<
  | { ok: true; value: Record<string, unknown>; exists: boolean; raw: string | null }
  | { ok: false; error: string }
> {
  const loaded = await readJsonConfig(path);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  if (!loaded.exists) return { ok: true, value: {}, exists: false, raw: null };
  if (!isPlainObject(loaded.value)) {
    return { ok: false, error: "top-level JSON value must be an object" };
  }
  return {
    ok: true,
    value: loaded.value,
    exists: true,
    raw: await readFile(path, "utf8"),
  };
}

export function ensureObject(
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const existing = parent[key];
  if (isPlainObject(existing)) return existing;
  const next: Record<string, unknown> = {};
  parent[key] = next;
  return next;
}

export async function writeJsonObjectIfChanged(
  path: string,
  beforeRaw: string | null,
  value: Record<string, unknown>,
): Promise<boolean> {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  if (beforeRaw === next) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next, "utf8");
  return true;
}
