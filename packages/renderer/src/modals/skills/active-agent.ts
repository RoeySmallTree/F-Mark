/* active-agent — small derivation + persistence helpers for the Skills
   palette (P9). The "active agent" controls which `.{agent}/skills/` folder
   is scanned (alongside the generic `.skills/`) by the kernel's
   `/skills?agent=<id>` endpoint.

   Resolution order at read time (`getActiveAgent()`):
     1. localStorage `fmark.activeAgent` (explicit user choice).
     2. deriveActiveAgent(participants) — pick the first agent participant
        whose `id` starts with a known prefix (ag-claude / ag-codex /
        ag-opencode). If multiple, the most-recently-registered one wins
        (we iterate Object.entries(participants) which preserves insertion
        order in V8/Node; the LAST matching entry wins).
     3. Fallback: 'claude' (default for `.claude/` projects). The Skills
        palette never NEEDS an agent to render — passing `null` to the API
        scans every agent dir — but a sensible default makes the visible
        dropdown read "Agent: Claude" out of the box.

   The user can switch agents via the dropdown at the top of the palette,
   which calls `setActiveAgent(key)`. We persist that to localStorage so the
   choice survives a reload.

   We deliberately keep this module pure aside from the localStorage I/O;
   the React glue (useEffect, state) lives inside SkillsPaletteModal. */

import type { Participant } from "@f-mark/shared";

export type AgentKey =
  | "claude"
  | "codex"
  | "opencode"
  | "generic"
  | null;

export const KNOWN_AGENT_KEYS = [
  "claude",
  "codex",
  "opencode",
  "generic",
] as const;

export const ACTIVE_AGENT_STORAGE_KEY = "fmark.activeAgent";

/* Human-readable labels for the dropdown. */
export const AGENT_LABELS: Record<NonNullable<AgentKey>, string> = {
  claude: "Claude",
  codex: "Codex",
  opencode: "Opencode",
  generic: "Generic",
};

/* Map a participant `suggested_id` prefix → AgentKey. The participants the
   user registers via Settings → Connected Agents have `suggested_id` values
   like `ag-claude-abc12` (per the kernel's register flow). This is only a
   fallback for legacy agents recorded before `runtime_id` existed — prefer
   `runtime_id` (see sessionAgentKey). */
const PREFIX_TO_KEY: ReadonlyArray<[string, NonNullable<AgentKey>]> = [
  ["ag-claude", "claude"],
  ["ag-codex", "codex"],
  ["ag-opencode", "opencode"],
];

function isAgentKey(v: unknown): v is NonNullable<AgentKey> {
  return (
    typeof v === "string" &&
    (KNOWN_AGENT_KEYS as readonly string[]).includes(v)
  );
}

/* Look at the registered participants and pick the most-likely active agent.
   Returns null if there are no agent participants we recognize. */
export function deriveActiveAgent(
  participants: Record<string, Participant>,
): AgentKey {
  /* Walk entries in iteration order; record the most-recently-seen matching
     key. (Object.entries preserves insertion order for string keys in modern
     JS; the kernel writes new agents at the end of config.json so this maps
     to "most recently registered".) */
  let last: AgentKey = null;
  for (const [id, p] of Object.entries(participants)) {
    if (p.kind !== "agent") continue;
    for (const [prefix, key] of PREFIX_TO_KEY) {
      if (id.startsWith(prefix)) {
        last = key;
        break;
      }
    }
  }
  return last;
}

/* Map a runtime_id (the canonical per-agent runtime, e.g. "claude",
   "opencode") to an AgentKey. Returns null for unknown/custom runtimes so
   resolution can fall through to other signals. */
export function runtimeToAgentKey(
  runtimeId: string | null | undefined,
): AgentKey {
  if (runtimeId === null || runtimeId === undefined) return null;
  return isAgentKey(runtimeId) ? runtimeId : null;
}

/* The canonical "which agent is in THIS session" signal: find the agent
   participant bound to `sessionId` (via its enriched `active_session`) and
   return its runtime. Prefers the explicit `runtime_id`; falls back to the
   id prefix for legacy agents recorded before runtime_id existed. Returns
   null when no agent is bound to the session. */
export function sessionAgentKey(
  participants: Record<string, Participant>,
  sessionId: string | null | undefined,
): AgentKey {
  if (sessionId === null || sessionId === undefined) return null;
  for (const [id, p] of Object.entries(participants)) {
    if (p.kind !== "agent") continue;
    if (p.active_session !== sessionId) continue;
    const byRuntime = runtimeToAgentKey(p.runtime_id);
    if (byRuntime !== null) return byRuntime;
    for (const [prefix, key] of PREFIX_TO_KEY) {
      if (id.startsWith(prefix)) return key;
    }
  }
  return null;
}

/* Read the persisted active agent. Returns null if there's no stored choice
   or if the stored value is not one of our known keys. */
export function readStoredActiveAgent(): AgentKey {
  try {
    const raw = globalThis.localStorage?.getItem(ACTIVE_AGENT_STORAGE_KEY);
    if (raw === null || raw === undefined) return null;
    if (isAgentKey(raw)) return raw;
    return null;
  } catch {
    return null;
  }
}

/* Persist the user's chosen active agent. Pass `null` to clear it (so the
   next read falls back to deriveActiveAgent). */
export function writeStoredActiveAgent(key: AgentKey): void {
  try {
    if (key === null) {
      globalThis.localStorage?.removeItem(ACTIVE_AGENT_STORAGE_KEY);
      return;
    }
    globalThis.localStorage?.setItem(ACTIVE_AGENT_STORAGE_KEY, key);
  } catch {
    /* swallow — running without localStorage */
  }
}

/* Resolve the agent the Skills palette should use *right now*.

   Resolution order:
     1. The agent bound to the current session (`sessionAgentKey`). This is
        the most accurate signal — it's literally the runtime you're talking
        to — and fixes the palette showing the wrong agent (e.g. "Codex"
        while you're in a Claude session) because of a stale global choice.
     2. The user's explicit dropdown choice persisted to localStorage.
     3. A last-match prefix heuristic over all participants (legacy).
     4. "claude" as a sensible default.

   `currentSessionId` is optional so existing callers keep working; the
   Skills palette passes the store's currentSessionId. */
export function resolveActiveAgent(
  participants: Record<string, Participant>,
  currentSessionId?: string | null,
): AgentKey {
  const sessionBound = sessionAgentKey(participants, currentSessionId);
  if (sessionBound !== null) return sessionBound;
  const stored = readStoredActiveAgent();
  if (stored !== null) return stored;
  const derived = deriveActiveAgent(participants);
  if (derived !== null) return derived;
  /* Sensible default: claude — most users we're targeting use Claude Code. */
  return "claude";
}
