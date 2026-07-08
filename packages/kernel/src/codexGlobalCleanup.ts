import { readFile, writeFile } from "node:fs/promises";
import { stripCodexFmarkMcpTables } from "./mcpInstall/codex.js";
import {
  autoStreamHookVersion,
  isFmarkAutoStreamCommand,
} from "./hooksInstall/command.js";
import { codexConfigPath, codexHooksPath } from "./hooksInstall/codex/paths.js";
import { isObject } from "./hooksInstall/codex/object.js";
import { codexHookHash, hookStateKey } from "./hooksInstall/codex/trustIdentity.js";
import {
  codexHookTrustStateFromToml,
  upsertHookTrustState,
} from "./hooksInstall/codex/trust.js";
import type { CodexHookTrustEntry } from "./hooksInstall/codex/trustEntries.js";

/* Codex now injects the `fmark` MCP server and autostream hooks per managed
   launch (see routes/managedAgents/codexLaunchInjection.ts), so the old
   machine-global install in `~/.codex/{config.toml,hooks.json}` must be removed
   — otherwise every manually-launched codex session keeps latching the fmark
   MCP server and firing the hooks. This migration is surgical and idempotent:
   it removes only F-Mark-owned entries, leaves `[features] hooks=true` and all
   unrelated servers/hooks/trust untouched, and never rewrites a hooks.json that
   holds no F-Mark hook. Runs on kernel boot and best-effort before each managed
   codex launch/reconnect. */

async function readTextOrEmpty(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/* A codex hook is F-Mark-owned only when its command is the autostream command
   AND carries the `--fmark-hook-version` flag. Requiring the version flag keeps
   this destructive, auto-running migration from deleting an unrelated user hook
   whose command merely contains "hook" and "auto-stream". */
function isFmarkOwnedHookCommand(command: string): boolean {
  return isFmarkAutoStreamCommand(command) && autoStreamHookVersion(command) !== null;
}

function pruneFmarkHooksJson(
  raw: string,
  hooksPath: string,
): { next: string; changed: boolean; removedTrustEntries: CodexHookTrustEntry[] } {
  const unchanged = {
    next: raw,
    changed: false,
    removedTrustEntries: [] as CodexHookTrustEntry[],
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return unchanged;
  }
  if (!isObject(parsed) || !isObject(parsed.hooks)) return unchanged;
  const hooksRoot = parsed.hooks;
  const removedTrustEntries: CodexHookTrustEntry[] = [];
  const nextHooks: Record<string, unknown> = {};
  let removedAny = false;

  for (const [event, groups] of Object.entries(hooksRoot)) {
    if (!Array.isArray(groups)) {
      nextHooks[event] = groups;
      continue;
    }
    let removedInEvent = false;
    const keptGroups: unknown[] = [];
    groups.forEach((group, groupIndex) => {
      if (!isObject(group) || !Array.isArray(group.hooks)) {
        keptGroups.push(group);
        return;
      }
      const keptHooks = group.hooks.filter((hook, hookIndex) => {
        if (
          !isObject(hook) ||
          typeof hook.command !== "string" ||
          !isFmarkOwnedHookCommand(hook.command)
        ) {
          return true;
        }
        removedAny = true;
        removedInEvent = true;
        // Record the trust key/hash for exactly this removed hook so the config
        // migration strips only its `[hooks.state]` entry — never a user's.
        const key = hookStateKey(hooksPath, event, groupIndex, hookIndex);
        const hash = codexHookHash({ event, group, hook });
        if (key !== null && hash !== null) removedTrustEntries.push({ key, hash });
        return false;
      });
      if (keptHooks.length > 0) keptGroups.push({ ...group, hooks: keptHooks });
      else if (group.hooks.length === 0) keptGroups.push(group);
    });
    // Drop an event key only when it became empty by removing F-Mark hooks;
    // preserve a pre-existing empty array as-is.
    if (keptGroups.length === 0 && removedInEvent) continue;
    nextHooks[event] = keptGroups;
  }

  if (!removedAny) return unchanged;
  const next = { ...parsed, hooks: nextHooks };
  return {
    next: `${JSON.stringify(next, null, 2)}\n`,
    changed: true,
    removedTrustEntries,
  };
}

export async function cleanupCodexGlobalFmarkInstall(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ changed: boolean; configChanged: boolean; hooksChanged: boolean }> {
  const configPath = codexConfigPath(env);
  const hooksPath = codexHooksPath(env);

  const configText = await readTextOrEmpty(configPath);
  const hooksText = await readTextOrEmpty(hooksPath);

  const hookPrune =
    hooksText === null
      ? { next: null as string | null, changed: false, removedTrustEntries: [] as CodexHookTrustEntry[] }
      : pruneFmarkHooksJson(hooksText, hooksPath);

  let configChanged = false;
  if (configText !== null) {
    const strippedMcp = stripCodexFmarkMcpTables(configText).text;
    // Strip a `[hooks.state]` table only when its stored `trusted_hash` matches
    // the hash of the fmark hook we actually removed — never by key alone — so a
    // trust entry we can't positively identify as ours is left intact.
    const trustState = codexHookTrustStateFromToml(strippedMcp);
    const exactTrustEntries = hookPrune.removedTrustEntries.filter(
      (entry) => trustState.get(entry.key)?.trustedHash === entry.hash,
    );
    const nextConfig = upsertHookTrustState(strippedMcp, [], exactTrustEntries);
    if (nextConfig !== configText) {
      await writeFile(configPath, nextConfig, "utf8");
      configChanged = true;
    }
  }

  let hooksChanged = false;
  if (hookPrune.changed && hookPrune.next !== null) {
    await writeFile(hooksPath, hookPrune.next, "utf8");
    hooksChanged = true;
  }

  return { changed: configChanged || hooksChanged, configChanged, hooksChanged };
}
