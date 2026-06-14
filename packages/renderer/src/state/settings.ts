/* settings — typed helpers for localStorage-backed user settings.

   All keys live under the `fmark:settings:` prefix so they don't collide
   with other localStorage usage. The helpers degrade gracefully when
   localStorage is unavailable (tests, private browsing) by returning the
   declared default and silently swallowing writes.

   Why not put these in the zustand store?
     - Each setting is read on first paint and rarely changes after.
     - Reading from a flat helper avoids subscribing every consumer to the
       full store, and keeps the "default true" semantics close to the data.
     - Settings that DO drive React re-rendering can use a small wrapper
       hook (see `useMessageEndsTurn` below). */

export const SETTINGS_PREFIX = "fmark:settings:";

export const KEY_MESSAGE_ENDS_TURN = `${SETTINGS_PREFIX}message-ends-turn`;
export const KEY_ENTER_TO_SEND = `${SETTINGS_PREFIX}enter-to-send`;
export const KEY_AGENT_ACCESS_MODES = `${SETTINGS_PREFIX}agent-access-modes`;
/* Set to "true" once the user has completed OR skipped the first-launch
   onboarding wizard. Absent/false ⇒ this browser has never been through
   onboarding, which is how the app detects a first launch. */
export const KEY_ONBOARDED = `${SETTINGS_PREFIX}onboarded`;

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    globalThis.localStorage?.setItem(key, value ? "true" : "false");
  } catch {
    /* swallow — localStorage may be unavailable */
  }
}

export function readMessageEndsTurn(): boolean {
  return readBool(KEY_MESSAGE_ENDS_TURN, true);
}

export function writeMessageEndsTurn(value: boolean): void {
  writeBool(KEY_MESSAGE_ENDS_TURN, value);
}

export function readEnterToSend(): boolean {
  return readBool(KEY_ENTER_TO_SEND, false);
}

export function writeEnterToSend(value: boolean): void {
  writeBool(KEY_ENTER_TO_SEND, value);
}

/* First-launch detection. `readOnboarded()` is false until the user finishes
   or skips the onboarding wizard, after which `writeOnboarded(true)` latches
   it so the wizard never auto-opens again on this browser. */
export function readOnboarded(): boolean {
  return readBool(KEY_ONBOARDED, false);
}

export function writeOnboarded(value: boolean): void {
  writeBool(KEY_ONBOARDED, value);
}

function readJsonMap(key: string): Record<string, string> {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw === null || raw === undefined) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === "string" && typeof v === "string" && v.length > 0) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeJsonMap(key: string, value: Record<string, string>): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* swallow — localStorage may be unavailable */
  }
}

export function readAgentAccessMode(
  runtimeId: string,
  fallback: string,
): string {
  return readJsonMap(KEY_AGENT_ACCESS_MODES)[runtimeId] ?? fallback;
}

export function writeAgentAccessMode(runtimeId: string, mode: string): void {
  const next = readJsonMap(KEY_AGENT_ACCESS_MODES);
  next[runtimeId] = mode;
  writeJsonMap(KEY_AGENT_ACCESS_MODES, next);
}
