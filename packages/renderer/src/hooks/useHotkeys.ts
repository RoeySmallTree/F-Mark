/**
 * useHotkeys — a tiny global hotkey hook.
 *
 * Pattern grammar: tokens are joined with `+`.
 *   - `$mod` resolves to ⌘ on macOS / Ctrl elsewhere.
 *   - `shift`, `alt`, `ctrl`, `meta` are modifiers.
 *   - Final token is the key: letters (`a`..`z`), digits, `/`, `?`, `enter`,
 *     `escape`, `space`, `,`, `.`, `[`, `]`, `arrowup`, `arrowdown`,
 *     `arrowleft`, `arrowright`.
 *
 * Multiple components may call this hook simultaneously; entries are merged
 * into a single module-level window listener. Identical chords from different
 * components overwrite based on registration order (last-mounted wins for that
 * exact chord), and unregister cleanly on unmount.
 *
 * Focus suppression: events whose target is inside <textarea>/<input> are
 * skipped UNLESS the chord includes `$mod` (so ⌘N still fires while typing).
 */
import { useEffect } from "react";

export type HotkeyHandler = (e: KeyboardEvent) => void | false;
export type HotkeyMap = Record<string, HotkeyHandler>;

/** A registered map plus a stable id for unregistration. */
interface RegisteredMap {
  id: number;
  map: HotkeyMap;
}

const REGISTRY: RegisteredMap[] = [];
let nextId = 1;
let listenerInstalled = false;

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform ?? "");

const domKeys = {
  spacebar: "Spacebar",
  enter: "Enter",
  escape: "Escape",
  esc: "Esc",
  arrowUp: "ArrowUp",
  arrowDown: "ArrowDown",
  arrowLeft: "ArrowLeft",
  arrowRight: "ArrowRight",
  question: "?",
} as const;

const hotkeyTokens = {
  space: "space",
  enter: "enter",
  escape: "escape",
  arrowUp: "arrowup",
  arrowDown: "arrowdown",
  arrowLeft: "arrowleft",
  arrowRight: "arrowright",
  question: "?",
  control: "control",
  ctrl: "ctrl",
  meta: "meta",
  alt: "alt",
  shift: "shift",
  mod: "$mod",
  empty: "",
} as const;

const editableTagNames = {
  textarea: "TEXTAREA",
  input: "INPUT",
} as const;

const keyboardEventNames = {
  keydown: "keydown",
} as const;

/** Normalize a single key string from a KeyboardEvent into our token vocab. */
function normalizeKey(e: KeyboardEvent): string {
  const k = e.key;
  if (k === " " || k === domKeys.spacebar) return hotkeyTokens.space;
  if (k === domKeys.enter) return hotkeyTokens.enter;
  if (k === domKeys.escape || k === domKeys.esc) return hotkeyTokens.escape;
  if (k === domKeys.arrowUp) return hotkeyTokens.arrowUp;
  if (k === domKeys.arrowDown) return hotkeyTokens.arrowDown;
  if (k === domKeys.arrowLeft) return hotkeyTokens.arrowLeft;
  if (k === domKeys.arrowRight) return hotkeyTokens.arrowRight;
  if (k === domKeys.question) return hotkeyTokens.question;
  // Letters / digits / punctuation → lower-case.
  return k.toLowerCase();
}

/** Build the canonical chord string for an event (modifiers sorted). */
function chordFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push(hotkeyTokens.ctrl);
  if (e.metaKey) parts.push(hotkeyTokens.meta);
  if (e.altKey) parts.push(hotkeyTokens.alt);
  if (e.shiftKey) parts.push(hotkeyTokens.shift);
  parts.sort();
  const key = normalizeKey(e);
  if (
    key === hotkeyTokens.control ||
    key === hotkeyTokens.meta ||
    key === hotkeyTokens.alt ||
    key === hotkeyTokens.shift
  ) {
    // Modifier-only press; never a chord.
    return hotkeyTokens.empty;
  }
  parts.push(key);
  return parts.join("+");
}

/** Build the canonical chord string from a user-supplied pattern. */
function chordFromPattern(pattern: string): string {
  const tokens = pattern
    .toLowerCase()
    .split("+")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const mods: string[] = [];
  let key: string = hotkeyTokens.empty;
  for (const tok of tokens) {
    if (tok === hotkeyTokens.mod) {
      mods.push(isMac ? hotkeyTokens.meta : hotkeyTokens.ctrl);
    } else if (
      tok === hotkeyTokens.ctrl ||
      tok === hotkeyTokens.meta ||
      tok === hotkeyTokens.alt ||
      tok === hotkeyTokens.shift
    ) {
      mods.push(tok);
    } else {
      // Final / key token. Use last one if multiple given (shouldn't happen).
      key = tok;
    }
  }
  mods.sort();
  mods.push(key);
  return mods.join("+");
}

/** True if a chord pattern uses $mod (mac meta / win ctrl). */
function patternUsesMod(chord: string): boolean {
  return chord.includes(isMac ? hotkeyTokens.meta : hotkeyTokens.ctrl);
}

function isEditableTarget(t: EventTarget | null): boolean {
  if (t === null) return false;
  if (!(t instanceof Element)) return false;
  const tag = t.tagName;
  if (
    tag === editableTagNames.textarea ||
    tag === editableTagNames.input
  ) {
    return true;
  }
  // contenteditable also counts.
  if ((t as HTMLElement).isContentEditable) return true;
  return false;
}

function onKey(e: KeyboardEvent): void {
  const chord = chordFromEvent(e);
  if (chord === hotkeyTokens.empty) return;

  const inEditable = isEditableTarget(e.target);

  // Search the registry in reverse so last-mounted wins for an identical chord.
  for (let i = REGISTRY.length - 1; i >= 0; i--) {
    const entry = REGISTRY[i]!;
    for (const pattern of Object.keys(entry.map)) {
      const wantChord = chordFromPattern(pattern);
      if (wantChord !== chord) continue;
      // Editable suppression: only allow if chord uses $mod.
      if (inEditable && !patternUsesMod(wantChord)) continue;
      const handler = entry.map[pattern]!;
      const result = handler(e);
      if (result !== false) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
  }
}

function ensureListener(): void {
  if (listenerInstalled) return;
  if (typeof window === "undefined") return;
  window.addEventListener(keyboardEventNames.keydown, onKey);
  listenerInstalled = true;
}

function maybeRemoveListener(): void {
  if (REGISTRY.length > 0) return;
  if (!listenerInstalled) return;
  if (typeof window === "undefined") return;
  window.removeEventListener(keyboardEventNames.keydown, onKey);
  listenerInstalled = false;
}

export function useHotkeys(map: HotkeyMap): void {
  useEffect(() => {
    const id = nextId++;
    REGISTRY.push({ id, map });
    ensureListener();
    return () => {
      const idx = REGISTRY.findIndex((r) => r.id === id);
      if (idx >= 0) REGISTRY.splice(idx, 1);
      maybeRemoveListener();
    };
    // We intentionally depend on a stable map identity per render — callers are
    // expected to memoize their handlers if needed. The hook is light enough
    // that we just register on every render to keep semantics obvious.
  }, [map]);
}

/** Test-only helper to confirm the platform detection result. */
export function _isMacPlatform(): boolean {
  return isMac;
}
