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

/** Normalize a single key string from a KeyboardEvent into our token vocab. */
function normalizeKey(e: KeyboardEvent): string {
  const k = e.key;
  if (k === " " || k === "Spacebar") return "space";
  if (k === "Enter") return "enter";
  if (k === "Escape" || k === "Esc") return "escape";
  if (k === "ArrowUp") return "arrowup";
  if (k === "ArrowDown") return "arrowdown";
  if (k === "ArrowLeft") return "arrowleft";
  if (k === "ArrowRight") return "arrowright";
  if (k === "?") return "?";
  // Letters / digits / punctuation → lower-case.
  return k.length === 1 ? k.toLowerCase() : k.toLowerCase();
}

/** Build the canonical chord string for an event (modifiers sorted). */
function chordFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.metaKey) parts.push("meta");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.sort();
  const key = normalizeKey(e);
  if (key === "control" || key === "meta" || key === "alt" || key === "shift") {
    // Modifier-only press; never a chord.
    return "";
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
  let key = "";
  for (const tok of tokens) {
    if (tok === "$mod") {
      mods.push(isMac ? "meta" : "ctrl");
    } else if (
      tok === "ctrl" ||
      tok === "meta" ||
      tok === "alt" ||
      tok === "shift"
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
  return chord.includes(isMac ? "meta" : "ctrl");
}

function isEditableTarget(t: EventTarget | null): boolean {
  if (t === null) return false;
  if (!(t instanceof Element)) return false;
  const tag = t.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT") return true;
  // contenteditable also counts.
  if ((t as HTMLElement).isContentEditable) return true;
  return false;
}

function onKey(e: KeyboardEvent): void {
  const chord = chordFromEvent(e);
  if (chord === "") return;

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
  window.addEventListener("keydown", onKey);
  listenerInstalled = true;
}

function maybeRemoveListener(): void {
  if (REGISTRY.length > 0) return;
  if (!listenerInstalled) return;
  if (typeof window === "undefined") return;
  window.removeEventListener("keydown", onKey);
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
