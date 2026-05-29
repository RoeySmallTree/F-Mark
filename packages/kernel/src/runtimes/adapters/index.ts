import { createCodexAdapter } from "./codex.js";
import { createClaudeAdapter } from "./claude.js";
import { createOpencodeAdapter } from "./opencode.js";
import type { RuntimeAdapter } from "./types.js";

export type { RuntimeAdapter, AdapterReadContext } from "./types.js";

const cache = new Map<string, RuntimeAdapter>();

/* Returns the adapter for a built-in runtime, or null for unknown / custom
   runtimes. Callers must handle null — adapters are an OPTIONAL feature
   layered on top of the runtime registry, not required for every runtime. */
export function getAdapter(runtimeId: string | null): RuntimeAdapter | null {
  if (!runtimeId) return null;
  const cached = cache.get(runtimeId);
  if (cached) return cached;
  let made: RuntimeAdapter | null = null;
  if (runtimeId === "codex") made = createCodexAdapter();
  else if (runtimeId === "claude") made = createClaudeAdapter();
  else if (runtimeId === "opencode") made = createOpencodeAdapter();
  if (made) cache.set(runtimeId, made);
  return made;
}
