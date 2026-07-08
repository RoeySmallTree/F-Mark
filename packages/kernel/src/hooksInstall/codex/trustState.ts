import {
  parseTomlQuotedKey,
  tomlString,
  tomlTableName,
} from "./toml.js";
import type { CodexHookTrustEntry } from "./trustEntries.js";

export function codexHookTrustStateFromToml(
  toml: string,
): Map<string, { trustedHash?: string; enabled?: boolean }> {
  const states = new Map<string, { trustedHash?: string; enabled?: boolean }>();
  let currentKey: string | null = null;
  for (const line of toml.split("\n")) {
    currentKey = nextTrustStateKey(line, currentKey, states);
    if (currentKey === null) continue;
    updateTrustStateFromLine(states.get(currentKey)!, line);
  }
  return states;
}

export function upsertHookTrustState(
  toml: string,
  entries: CodexHookTrustEntry[],
  staleEntries: CodexHookTrustEntry[] = [],
): string {
  if (entries.length === 0 && staleEntries.length === 0) return toml;
  const keys = new Set([...entries, ...staleEntries].map((entry) => entry.key));
  const stripped = removeHookStateTables(toml, keys).trimEnd();
  if (entries.length === 0) return `${stripped}${stripped.length > 0 ? "\n" : ""}`;
  return appendTrustStateBlocks(stripped, entries);
}

function nextTrustStateKey(
  line: string,
  currentKey: string | null,
  states: Map<string, { trustedHash?: string; enabled?: boolean }>,
): string | null {
  const table = tomlTableName(line);
  if (table === null) return currentKey;
  const key = hookStateKeyFromTableName(table);
  if (key !== null && !states.has(key)) states.set(key, {});
  return key;
}

function updateTrustStateFromLine(
  state: { trustedHash?: string; enabled?: boolean },
  line: string,
): void {
  const trusted = line.match(/^\s*trusted_hash\s*=\s*"([^"]+)"\s*$/);
  if (trusted) {
    state.trustedHash = trusted[1];
    return;
  }
  const enabled = line.match(/^\s*enabled\s*=\s*(true|false)\s*$/);
  if (enabled) state.enabled = enabled[1] === "true";
}

function appendTrustStateBlocks(
  stripped: string,
  entries: CodexHookTrustEntry[],
): string {
  const stateBlocks = entries.map((entry) =>
    [
      `[hooks.state.${tomlString(entry.key)}]`,
      `trusted_hash = ${tomlString(entry.hash)}`,
      "enabled = true",
    ].join("\n"),
  );
  return `${stripped}${stripped.length > 0 ? "\n\n" : ""}${stateBlocks.join("\n\n")}\n`;
}

function hookStateKeyFromTableName(tableName: string): string | null {
  const prefix = "hooks.state.";
  if (!tableName.startsWith(prefix)) return null;
  return parseTomlQuotedKey(tableName.slice(prefix.length));
}

function removeHookStateTables(text: string, keys: Set<string>): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    skipping = shouldSkipLine(line, keys, skipping);
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}$/g, "\n\n");
}

function shouldSkipLine(line: string, keys: Set<string>, skipping: boolean): boolean {
  const table = tomlTableName(line);
  if (table === null) return skipping;
  const key = hookStateKeyFromTableName(table);
  return key !== null && keys.has(key);
}
