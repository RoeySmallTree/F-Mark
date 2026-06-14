import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { IntegrationLocation } from "@f-mark/shared";
import {
  ensureObject,
  getObject,
  readJsonConfig,
  readJsonObjectForWrite,
  statusFromOpencodeServer,
  writeJsonObjectIfChanged,
} from "./json.js";
import {
  FMARK_MCP_INSTALL_VERSION,
  fmarkMcpCommandSpec,
  makeCheck,
  configHome,
  type McpApplyInput,
  type McpDetectInput,
} from "./types.js";

async function firstExisting(candidates: string[]): Promise<string | null> {
  for (const c of candidates) {
    try {
      await stat(c);
      return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

function projectCandidates(projectRoot: string): string[] {
  // Prefer existing file. If neither exists, default to `.json`.
  return [join(projectRoot, "opencode.json"), join(projectRoot, "opencode.jsonc")];
}

function userCandidates(env: NodeJS.ProcessEnv): string[] {
  const base = join(configHome(env), "opencode");
  return [join(base, "opencode.json"), join(base, "opencode.jsonc")];
}

async function detectAt(
  scope: "project" | "user",
  candidates: string[],
  safeAutoApply: boolean,
  expected: { command: string; args: string[] },
): Promise<IntegrationLocation> {
  const path = (await firstExisting(candidates)) ?? candidates[0]!;
  const loaded = await readJsonConfig(path);
  if (!loaded.ok) {
    return {
      scope,
      path,
      status: "blocked",
      reason: `invalid JSON/JSONC: ${loaded.error}`,
      safe_auto_apply: false,
    };
  }
  if (!loaded.exists) {
    return { scope, path, status: "missing", safe_auto_apply: safeAutoApply };
  }
  const servers = getObject(loaded.value, "mcp");
  const current = statusFromOpencodeServer(servers?.fmark, expected);
  return {
    scope,
    path,
    status: current.status,
    version: current.version,
    reason: current.reason,
    safe_auto_apply: safeAutoApply,
  };
}

export async function detectOpencodeMcp(input: McpDetectInput) {
  const expected = fmarkMcpCommandSpec(input.projectRoot, input.env);
  return makeCheck([
    await detectAt("project", projectCandidates(input.projectRoot), true, expected),
    await detectAt("user", userCandidates(input.env), true, expected),
  ]);
}

function opencodeServer(input: McpApplyInput): Record<string, unknown> {
  const spec = fmarkMcpCommandSpec(input.projectRoot, input.env);
  return {
    type: "local",
    command: [spec.command, ...spec.args],
    environment: spec.env,
    enabled: true,
  };
}

export async function applyOpencodeMcp(input: McpApplyInput) {
  if (input.scope !== "project" && input.scope !== "user") {
    throw new Error(`Opencode MCP apply does not support scope: ${input.scope}`);
  }
  const candidates =
    input.scope === "project"
      ? projectCandidates(input.projectRoot)
      : userCandidates(input.env);
  const path = (await firstExisting(candidates)) ?? candidates[0]!;
  const loaded = await readJsonObjectForWrite(path);
  if (!loaded.ok) throw new Error(`blocked MCP config ${path}: ${loaded.error}`);
  const servers = ensureObject(loaded.value, "mcp");
  servers.fmark = opencodeServer(input);
  const changed = await writeJsonObjectIfChanged(path, loaded.raw, loaded.value);
  return {
    changed,
    location: {
      scope: input.scope,
      path,
      status: "installed" as const,
      version: FMARK_MCP_INSTALL_VERSION,
      safe_auto_apply: true,
    },
  };
}
