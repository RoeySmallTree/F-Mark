/* settings — typed helpers for localStorage-backed user settings.

   All keys live under the `fmark:settings:` prefix so they don't collide
   with other localStorage usage. The helpers degrade gracefully when
   localStorage is unavailable (tests, private browsing) by returning the
   declared default and silently swallowing writes.

   Why not put these in the zustand store?
     - Each setting is read on first paint and rarely changes after.
     - Reading from a flat helper avoids subscribing every consumer to the
       full store, and keeps each setting's default semantics close to the data.
     - Settings that DO drive React re-rendering can use a small wrapper
       hook (see `useMessageEndsTurn` below). */

const SETTINGS_PREFIX = "fmark:settings:";

const KEY_MESSAGE_ENDS_TURN = `${SETTINGS_PREFIX}message-ends-turn`;
const KEY_COMMENT_ENDS_TURN = `${SETTINGS_PREFIX}comment-ends-turn`;
const KEY_CHOICE_ENDS_TURN = `${SETTINGS_PREFIX}choice-ends-turn`;
const KEY_ENTER_TO_SEND = `${SETTINGS_PREFIX}enter-to-send`;
const KEY_FILE_AUTOSAVE = `${SETTINGS_PREFIX}file-autosave`;
const KEY_MARKDOWN_VIEW_MODE = `${SETTINGS_PREFIX}markdown-view-mode`;
const KEY_JSON_VIEW_MODE = `${SETTINGS_PREFIX}json-view-mode`;
/* Set to "true" once the user has completed OR skipped the first-launch
   onboarding wizard. Absent/false ⇒ this browser has never been through
   onboarding, which is how the app detects a first launch. */
const KEY_ONBOARDED = `${SETTINGS_PREFIX}onboarded`;

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

export function readCommentEndsTurn(): boolean {
  return readBool(KEY_COMMENT_ENDS_TURN, true);
}

export function writeCommentEndsTurn(value: boolean): void {
  writeBool(KEY_COMMENT_ENDS_TURN, value);
}

export function readChoiceEndsTurn(): boolean {
  return readBool(KEY_CHOICE_ENDS_TURN, false);
}

export function writeChoiceEndsTurn(value: boolean): void {
  writeBool(KEY_CHOICE_ENDS_TURN, value);
}

export function readEnterToSend(): boolean {
  return readBool(KEY_ENTER_TO_SEND, false);
}

export function writeEnterToSend(value: boolean): void {
  writeBool(KEY_ENTER_TO_SEND, value);
}

export function readFileAutosave(): boolean {
  return readBool(KEY_FILE_AUTOSAVE, true);
}

export function writeFileAutosave(value: boolean): void {
  writeBool(KEY_FILE_AUTOSAVE, value);
}

export const MARKDOWN_VIEW_MODE_VALUES = {
  preview: "preview",
  interactive: "interactive",
  source: "source",
  sideBySide: "side-by-side",
} as const;

export type MarkdownViewMode =
  (typeof MARKDOWN_VIEW_MODE_VALUES)[keyof typeof MARKDOWN_VIEW_MODE_VALUES];

export const DEFAULT_MARKDOWN_VIEW_MODE: MarkdownViewMode =
  MARKDOWN_VIEW_MODE_VALUES.preview;

const MARKDOWN_VIEW_MODES: MarkdownViewMode[] = [
  MARKDOWN_VIEW_MODE_VALUES.preview,
  MARKDOWN_VIEW_MODE_VALUES.interactive,
  MARKDOWN_VIEW_MODE_VALUES.source,
  MARKDOWN_VIEW_MODE_VALUES.sideBySide,
];

export function readMarkdownViewMode(): MarkdownViewMode {
  try {
    const raw = globalThis.localStorage?.getItem(KEY_MARKDOWN_VIEW_MODE);
    if (raw === null || raw === undefined) return DEFAULT_MARKDOWN_VIEW_MODE;
    return MARKDOWN_VIEW_MODES.includes(raw as MarkdownViewMode)
      ? (raw as MarkdownViewMode)
      : DEFAULT_MARKDOWN_VIEW_MODE;
  } catch {
    return DEFAULT_MARKDOWN_VIEW_MODE;
  }
}

export function writeMarkdownViewMode(value: MarkdownViewMode): void {
  try {
    globalThis.localStorage?.setItem(KEY_MARKDOWN_VIEW_MODE, value);
  } catch {
    /* swallow — localStorage may be unavailable */
  }
}

export const JSON_VIEW_MODE_VALUES = {
  source: "source",
  tree: "tree",
} as const;

export type JsonViewMode =
  (typeof JSON_VIEW_MODE_VALUES)[keyof typeof JSON_VIEW_MODE_VALUES];

export const DEFAULT_JSON_VIEW_MODE: JsonViewMode =
  JSON_VIEW_MODE_VALUES.source;

const JSON_VIEW_MODES: JsonViewMode[] = [
  JSON_VIEW_MODE_VALUES.source,
  JSON_VIEW_MODE_VALUES.tree,
];

export function readJsonViewMode(): JsonViewMode {
  try {
    const raw = globalThis.localStorage?.getItem(KEY_JSON_VIEW_MODE);
    if (raw === null || raw === undefined) return DEFAULT_JSON_VIEW_MODE;
    return JSON_VIEW_MODES.includes(raw as JsonViewMode)
      ? (raw as JsonViewMode)
      : DEFAULT_JSON_VIEW_MODE;
  } catch {
    return DEFAULT_JSON_VIEW_MODE;
  }
}

export function writeJsonViewMode(value: JsonViewMode): void {
  try {
    globalThis.localStorage?.setItem(KEY_JSON_VIEW_MODE, value);
  } catch {
    /* swallow — localStorage may be unavailable */
  }
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
