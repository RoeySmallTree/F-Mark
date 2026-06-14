import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DetectResult, HookEntry } from "./types.js";
import {
  FMARK_HOOK_INSTALL_VERSION,
  autoStreamHookCommand,
  autoStreamHookVersion,
  isFmarkAutoStreamCommand,
} from "./command.js";

export function codexConfigPath(): string {
  return join(codexHome(), "config.toml");
}

export function codexHooksPath(): string {
  return join(codexHome(), "hooks.json");
}

function codexHome(): string {
  return process.env.CODEX_HOME ?? join(homedir(), ".codex");
}

/**
 * Strip TOML comments from a line: anything after an unquoted `#` is dropped.
 * Honors basic single/double-quoted strings (with backslash escape) so that a
 * `#` inside a string literal is preserved. This is a best-effort heuristic —
 * full TOML literal-string semantics are beyond what v0.4 detection needs.
 */
function stripTomlCommentsFromLine(line: string): string {
  let inStr = false;
  let quoteCh = "";
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inStr) {
      out += c;
      if (c === quoteCh && line[i - 1] !== "\\") {
        inStr = false;
        quoteCh = "";
      }
    } else if (c === "#") {
      break; // comment to EOL
    } else {
      out += c;
      if (c === '"' || c === "'") {
        inStr = true;
        quoteCh = c;
      }
    }
  }
  return out;
}

function stripTomlComments(toml: string): string {
  return toml.split("\n").map(stripTomlCommentsFromLine).join("\n");
}

/**
 * Scan TOML for `[[hooks.<Event>]]` blocks and return each block's `command`
 * value as a raw string (joined for multi-line arrays). The scanner tracks
 * bracket depth so multi-line `command = [\n ... \n]` values are captured
 * intact, and commented-out lines are dropped before scanning.
 */
export function findHookCommands(
  toml: string,
): { event: string; command: string; matcher?: string | null }[] {
  const cleaned = stripTomlComments(toml);
  const results: { event: string; command: string; matcher?: string | null }[] = [];
  const lines = cleaned.split("\n");
  let currentEvent: string | null = null;
  let buffering = false;
  let bufferDepth = 0;
  let buffer = "";
  const headerRe = /^\[\[hooks\.([A-Za-z]+)\]\]$/;
  const commandRe = /^command\s*=\s*(.+)$/;
  for (const raw of lines) {
    const line = raw.trim();
    // A new table header always ends any prior multi-line buffer (best-effort).
    if (line.startsWith("[")) {
      if (buffering && buffer) {
        results.push({ event: currentEvent ?? "", command: buffer });
        buffering = false;
        buffer = "";
        bufferDepth = 0;
      }
      const m = headerRe.exec(line);
      currentEvent = m ? m[1]! : null;
      continue;
    }
    if (currentEvent === null) continue;
    if (!buffering) {
      const cm = commandRe.exec(line);
      if (!cm) continue;
      const rhs = cm[1]!;
      // Compute bracket depth from this initial fragment.
      let depth = 0;
      for (const c of rhs) {
        if (c === "[") depth++;
        else if (c === "]") depth--;
      }
      if (depth > 0) {
        buffering = true;
        bufferDepth = depth;
        buffer = rhs;
      } else {
        results.push({ event: currentEvent, command: rhs });
      }
    } else {
      buffer += " " + line;
      for (const c of line) {
        if (c === "[") bufferDepth++;
        else if (c === "]") bufferDepth--;
      }
      if (bufferDepth <= 0) {
        results.push({ event: currentEvent, command: buffer });
        buffering = false;
        buffer = "";
        bufferDepth = 0;
      }
    }
  }
  if (buffering && buffer) {
    // Unterminated buffer — still emit so callers can see what was there.
    results.push({ event: currentEvent ?? "", command: buffer });
  }
  return results;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (isObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child !== undefined) out[key] = canonicalJson(child);
    }
    return out;
  }
  return value;
}

function hookEventStateLabel(event: string): string | null {
  if (event === "Stop") return "stop";
  if (event === "UserPromptSubmit") return "user_prompt_submit";
  if (event === "PermissionRequest") return "permission_request";
  return null;
}

function codexHookHash(input: {
  event: string;
  group: Record<string, unknown>;
  hook: Record<string, unknown>;
}): string | null {
  const eventName = hookEventStateLabel(input.event);
  if (eventName === null || typeof input.hook.command !== "string") return null;
  const matcher =
    typeof input.group.matcher === "string" && input.group.matcher.trim().length > 0
      ? input.group.matcher
      : undefined;
  const timeout =
    typeof input.hook.timeout === "number" && Number.isFinite(input.hook.timeout)
      ? Math.max(1, input.hook.timeout)
      : 600;
  const normalizedHook: Record<string, unknown> = {
    type: "command",
    command: input.hook.command,
    timeout,
    async: input.hook.async === true,
  };
  if (typeof input.hook.statusMessage === "string") {
    normalizedHook.statusMessage = input.hook.statusMessage;
  }
  const identity: Record<string, unknown> = {
    event_name: eventName,
    hooks: [normalizedHook],
  };
  if (matcher !== undefined) identity.matcher = matcher;
  const serialized = JSON.stringify(canonicalJson(identity));
  return `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
}

interface CodexHookTrustEntry {
  key: string;
  hash: string;
}

function hookStateKey(
  sourcePath: string,
  event: string,
  groupIndex: number,
  hookIndex: number,
): string | null {
  const eventName = hookEventStateLabel(event);
  if (eventName === null) return null;
  return `${sourcePath}:${eventName}:${groupIndex}:${hookIndex}`;
}

function fmarkHookTrustEntriesFromConfig(
  config: Record<string, unknown>,
  sourcePath: string,
): CodexHookTrustEntry[] {
  const hooksRoot = isObject(config.hooks) ? config.hooks : {};
  const entries: CodexHookTrustEntry[] = [];
  for (const event of ["Stop", "UserPromptSubmit", "PermissionRequest"]) {
    const groups = hooksRoot[event];
    if (!Array.isArray(groups)) continue;
    groups.forEach((group, groupIndex) => {
      if (!isObject(group) || !Array.isArray(group.hooks)) return;
      group.hooks.forEach((hook, hookIndex) => {
        if (!isObject(hook) || typeof hook.command !== "string") return;
        if (!isFmarkAutoStreamCommand(hook.command)) return;
        const key = hookStateKey(sourcePath, event, groupIndex, hookIndex);
        const hash = codexHookHash({ event, group, hook });
        if (key !== null && hash !== null) entries.push({ key, hash });
      });
    });
  }
  return entries;
}

function fmarkHookTrustEntriesFromJson(
  raw: string,
  sourcePath: string,
): CodexHookTrustEntry[] {
  if (raw.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return [];
    return fmarkHookTrustEntriesFromConfig(parsed, sourcePath);
  } catch {
    return [];
  }
}

function findJsonHookCommands(
  raw: string,
): { event: string; command: string; matcher?: string | null }[] {
  if (raw.trim().length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!isObject(parsed) || !isObject(parsed.hooks)) return [];
  const results: { event: string; command: string; matcher?: string | null }[] = [];
  for (const [event, groups] of Object.entries(parsed.hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!isObject(group) || !Array.isArray(group.hooks)) continue;
      for (const hook of group.hooks) {
        if (!isObject(hook) || typeof hook.command !== "string") continue;
        results.push({
          event,
          command: hook.command,
          matcher:
            typeof group.matcher === "string"
              ? group.matcher
              : group.matcher === null
                ? null
                : undefined,
        });
      }
    }
  }
  return results;
}

function codexHooksEnabled(toml: string): boolean {
  const cleaned = stripTomlComments(toml);
  const lines = cleaned.split("\n");
  let inFeatures = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[.+\]$/.test(line)) {
      inFeatures = line === "[features]";
      continue;
    }
    if (inFeatures && /^hooks\s*=\s*true\s*$/.test(line)) return true;
  }
  return false;
}

function enableCodexHooksFeature(toml: string): string {
  if (codexHooksEnabled(toml)) return toml;
  const lines = toml.split("\n");
  const featuresIndex = lines.findIndex((line) => line.trim() === "[features]");
  if (featuresIndex >= 0) {
    let insertAt = featuresIndex + 1;
    while (insertAt < lines.length && !/^\s*\[.+\]\s*$/.test(lines[insertAt]!)) {
      if (/^\s*hooks\s*=/.test(lines[insertAt]!)) {
        lines[insertAt] = "hooks = true";
        return lines.join("\n");
      }
      insertAt++;
    }
    lines.splice(featuresIndex + 1, 0, "hooks = true");
    return lines.join("\n");
  }
  const suffix = toml.trim().length > 0 ? "\n\n" : "";
  return `${toml}${suffix}[features]\nhooks = true\n`;
}

function normalizeDetectedCommand(command: string): string {
  const trimmed = command.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const parts = [...trimmed.matchAll(/"((?:\\.|[^"])*)"/g)].map((match) => {
      try {
        return JSON.parse(`"${match[1] ?? ""}"`) as string;
      } catch {
        return match[1] ?? "";
      }
    });
    if (parts.length > 0) return parts.join(" ");
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function detectCodexHooks(
  input: string | { toml: string; hooksJson?: string; configPath?: string },
  agentId: string,
  userId: string,
): DetectResult {
  const toml = typeof input === "string" ? input : input.toml;
  const hooksJson = typeof input === "string" ? "" : input.hooksJson ?? "";
  const configPath =
    typeof input === "string"
      ? codexConfigPath()
      : input.configPath ?? (hooksJson.trim().length > 0 ? codexHooksPath() : codexConfigPath());
  const detected: HookEntry[] = [];
  const agentCommand = autoStreamHookCommand({ participantId: agentId });
  const userCommand = autoStreamHookCommand({
    participantId: userId,
    kind: "user",
  });
  const hits = [...findHookCommands(toml), ...findJsonHookCommands(hooksJson)];
  for (const { event, command, matcher } of hits) {
    const normalizedCommand = normalizeDetectedCommand(command);
    if (
      event !== "Stop" &&
      event !== "UserPromptSubmit" &&
      event !== "PermissionRequest"
    ) {
      continue;
    }
    if (isFmarkAutoStreamCommand(normalizedCommand)) {
      detected.push({
        event,
        command: normalizedCommand,
        ...(matcher !== undefined ? { matcher } : {}),
        version: autoStreamHookVersion(normalizedCommand),
      });
    }
  }
  const hasExpected = (event: string, command: string) =>
    detected.some((entry) => entry.event === event && entry.command === command);
  const capturesCodexPermissionRequests = detected.some(
    (entry) =>
      entry.event === "PermissionRequest" &&
      entry.command === agentCommand &&
      (entry.matcher === undefined ||
        entry.matcher === null ||
        entry.matcher.trim().length === 0 ||
        entry.matcher.includes("mcp") ||
        entry.matcher.includes("fmark") ||
        entry.matcher === ".*" ||
        entry.matcher === "*"),
  );
  const installedByConfig =
    codexHooksEnabled(toml) &&
    hasExpected("Stop", agentCommand) &&
    hasExpected("UserPromptSubmit", userCommand) &&
    capturesCodexPermissionRequests;
  const trustEntries =
    hooksJson.trim().length > 0
      ? fmarkHookTrustEntriesFromJson(hooksJson, configPath)
      : [];
  const trustState = codexHookTrustStateFromToml(toml);
  const trusted =
    trustEntries.length === 0 ||
    trustEntries.every((entry) => {
      const state = trustState.get(entry.key);
      return state?.enabled !== false && state?.trustedHash === entry.hash;
    });
  const installed = installedByConfig && trusted;
  const status = installed
    ? "installed"
    : detected.length > 0
      ? "stale"
      : "missing";
  return {
    installed,
    status,
    configPath,
    expectedVersion: FMARK_HOOK_INSTALL_VERSION,
    detectedVersion: detected[0]?.version ?? null,
    detectedEntries: detected,
    expectedEntries: [
      {
        event: "Stop",
        command: agentCommand,
        version: FMARK_HOOK_INSTALL_VERSION,
      },
      {
        event: "UserPromptSubmit",
        command: userCommand,
        version: FMARK_HOOK_INSTALL_VERSION,
      },
      {
        event: "PermissionRequest",
        command: agentCommand,
        version: FMARK_HOOK_INSTALL_VERSION,
      },
    ],
  };
}

export async function loadCodexConfig(projectRoot?: string): Promise<{
  toml: string;
  hooksJson: string;
  configPath: string;
}> {
  const parts: string[] = [];
  try {
    parts.push(await readFile(codexConfigPath(), "utf8"));
  } catch {
    // user-level config missing — that's fine
  }
  if (projectRoot) {
    try {
      parts.push(await readFile(join(projectRoot, ".codex", "config.toml"), "utf8"));
    } catch {
      // project-local config missing — that's fine
    }
  }
  let hooksJson = "";
  try {
    hooksJson = await readFile(codexHooksPath(), "utf8");
  } catch {
    // hooks.json missing — that's fine
  }
  return {
    toml: parts.join("\n"),
    hooksJson,
    configPath: codexHooksPath(),
  };
}

function expectedCodexHookGroups(agentId: string, userId: string): Record<string, unknown[]> {
  const agentCommand = autoStreamHookCommand({ participantId: agentId });
  const userCommand = autoStreamHookCommand({
    participantId: userId,
    kind: "user",
  });
  return {
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: agentCommand,
            timeout: 30,
          },
        ],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: "command",
            command: userCommand,
            timeout: 10,
          },
        ],
      },
    ],
    PermissionRequest: [
      {
        hooks: [
          {
            type: "command",
            command: agentCommand,
            timeout: 300,
            statusMessage: "Waiting for F-Mark access response",
          },
        ],
      },
    ],
  };
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlTableName(line: string): string | null {
  const match = line.match(/^\s*\[([^[\]][^\]]*)\]\s*(?:#.*)?$/);
  return match?.[1]?.trim() ?? null;
}

function parseTomlQuotedKey(value: string): string | null {
  if (!value.startsWith('"')) return null;
  try {
    return JSON.parse(value) as string;
  } catch {
    return null;
  }
}

function hookStateKeyFromTableName(tableName: string): string | null {
  const prefix = "hooks.state.";
  if (!tableName.startsWith(prefix)) return null;
  return parseTomlQuotedKey(tableName.slice(prefix.length));
}

function codexHookTrustStateFromToml(
  toml: string,
): Map<string, { trustedHash?: string; enabled?: boolean }> {
  const states = new Map<string, { trustedHash?: string; enabled?: boolean }>();
  let currentKey: string | null = null;
  for (const line of toml.split("\n")) {
    const table = tomlTableName(line);
    if (table !== null) {
      currentKey = hookStateKeyFromTableName(table);
      if (currentKey !== null && !states.has(currentKey)) states.set(currentKey, {});
      continue;
    }
    if (currentKey === null) continue;
    const trusted = line.match(/^\s*trusted_hash\s*=\s*"([^"]+)"\s*$/);
    if (trusted) {
      states.get(currentKey)!.trustedHash = trusted[1];
      continue;
    }
    const enabled = line.match(/^\s*enabled\s*=\s*(true|false)\s*$/);
    if (enabled) {
      states.get(currentKey)!.enabled = enabled[1] === "true";
    }
  }
  return states;
}

function removeHookStateTables(text: string, keys: Set<string>): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const table = tomlTableName(line);
    if (table !== null) {
      const key = hookStateKeyFromTableName(table);
      skipping = key !== null && keys.has(key);
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}$/g, "\n\n");
}

function upsertHookTrustState(
  toml: string,
  entries: CodexHookTrustEntry[],
  staleEntries: CodexHookTrustEntry[] = [],
): string {
  if (entries.length === 0 && staleEntries.length === 0) return toml;
  const keys = new Set([...entries, ...staleEntries].map((entry) => entry.key));
  const stripped = removeHookStateTables(toml, keys).trimEnd();
  if (entries.length === 0) return `${stripped}${stripped.length > 0 ? "\n" : ""}`;
  const stateBlocks = entries.map((entry) =>
    [
      `[hooks.state.${tomlString(entry.key)}]`,
      `trusted_hash = ${tomlString(entry.hash)}`,
      "enabled = true",
    ].join("\n"),
  );
  return `${stripped}${stripped.length > 0 ? "\n\n" : ""}${stateBlocks.join("\n\n")}\n`;
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path, "utf8");
    if (raw.trim().length === 0) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) throw new Error("hooks JSON root must be an object");
    return parsed;
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return {};
    }
    throw err;
  }
}

function mergeCodexHookJson(
  target: Record<string, unknown>,
  agentId: string,
  userId: string,
): void {
  if (!isObject(target.hooks)) target.hooks = {};
  const hooks = target.hooks as Record<string, unknown>;
  const expected = expectedCodexHookGroups(agentId, userId);
  for (const [event, groups] of Object.entries(expected)) {
    const current = (Array.isArray(hooks[event]) ? hooks[event] : [])
      .map((group) => {
        if (!isObject(group) || !Array.isArray(group.hooks)) return group;
        const nextHooks = group.hooks.filter((hook) => {
          if (!isObject(hook) || typeof hook.command !== "string") return true;
          if (!isFmarkAutoStreamCommand(hook.command)) return true;
          return false;
        });
        return nextHooks.length > 0 ? { ...group, hooks: nextHooks } : null;
      })
      .filter((group) => group !== null);
    for (const group of groups) {
      const command = JSON.stringify(group);
      const exists = current.some((entry) => JSON.stringify(entry) === command);
      if (!exists) current.push(group);
    }
    hooks[event] = current;
  }
}

export async function applyCodexHooks(
  agentId: string,
  userId: string,
): Promise<{ changed: boolean; configPath: string; hooksPath: string }> {
  const configPath = codexConfigPath();
  let existingToml = "";
  try {
    existingToml = await readFile(configPath, "utf8");
  } catch (err) {
    if (
      !(err instanceof Error) ||
      !("code" in err) ||
      (err as NodeJS.ErrnoException).code !== "ENOENT"
    ) {
      throw err;
    }
  }
  let nextToml = enableCodexHooksFeature(existingToml);

  const hooksPath = codexHooksPath();
  const hooksJson = await readJsonObject(hooksPath);
  const staleTrustEntries = fmarkHookTrustEntriesFromConfig(hooksJson, hooksPath);
  const before = JSON.stringify(hooksJson);
  mergeCodexHookJson(hooksJson, agentId, userId);
  const trustEntries = fmarkHookTrustEntriesFromConfig(hooksJson, hooksPath);
  nextToml = upsertHookTrustState(nextToml, trustEntries, staleTrustEntries);
  let changed = nextToml !== existingToml;
  if (changed) {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, nextToml, "utf8");
  }
  const after = JSON.stringify(hooksJson);
  if (after !== before) {
    await mkdir(dirname(hooksPath), { recursive: true });
    await writeFile(hooksPath, `${JSON.stringify(hooksJson, null, 2)}\n`, "utf8");
    changed = true;
  }
  return { changed, configPath, hooksPath };
}

export function renderCodexInstallSnippet(agentId: string, userId: string): string {
  const agentCommand = autoStreamHookCommand({ participantId: agentId });
  const userCommand = autoStreamHookCommand({
    participantId: userId,
    kind: "user",
  });
  const hooks = {
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: agentCommand,
              timeout: 30,
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: "command",
              command: userCommand,
              timeout: 10,
            },
          ],
        },
      ],
      PermissionRequest: [
        {
          hooks: [
            {
              type: "command",
              command: agentCommand,
              timeout: 300,
              statusMessage: "Waiting for F-Mark access response",
            },
          ],
        },
      ],
    },
  };
  return [
    "Enable hooks in `~/.codex/config.toml`:",
    "",
    "```toml",
    "[features]",
    "hooks = true",
    "```",
    "",
    "Then add to `~/.codex/hooks.json`:",
    "",
    "```json",
    JSON.stringify(hooks, null, 2),
    "```",
    "",
    "On first run, Codex will prompt you to trust the hook command. Approve once.",
  ].join("\n");
}
