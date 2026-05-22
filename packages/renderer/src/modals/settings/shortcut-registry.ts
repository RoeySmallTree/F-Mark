/**
 * Cross-platform shortcut registry used by the Settings → Shortcuts section.
 *
 * The strings in `combo` use the same `$mod+...` grammar as `useHotkeys`, so a
 * binding written here will line up exactly with what the hook expects. The
 * renderer formats each combo into its per-platform key chips (⌘ on macOS,
 * Ctrl elsewhere) at module load.
 *
 * Adding a new shortcut: add an entry below. There's no auto-discovery — this
 * is the source of truth that the UI reads.
 */

export type ShortcutSection = "compose" | "navigation" | "misc";

export interface ShortcutEntry {
  combo: string;
  description: string;
  section: ShortcutSection;
}

export const SHORTCUTS: ShortcutEntry[] = [
  // Compose
  { combo: "$mod+/", description: "Toggle comment mode", section: "compose" },
  { combo: "$mod+N", description: "Toggle named mode", section: "compose" },
  { combo: "$mod+Enter", description: "Send / end turn", section: "compose" },
  {
    combo: "Escape",
    description: "Close modal / clear comment target",
    section: "compose",
  },
  // Navigation
  { combo: "$mod+K", description: "Command palette", section: "navigation" },
  { combo: "$mod+P", description: "Presets palette", section: "navigation" },
  {
    combo: "$mod+Shift+K",
    description: "Skills palette",
    section: "navigation",
  },
];

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform ?? "");

const SYMBOL: Record<string, string> = {
  shift: "Shift",
  alt: isMac ? "Option" : "Alt",
  enter: "Enter",
  escape: "Esc",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  space: "Space",
};

/** Convert a `$mod+...` pattern to the platform-specific list of key chips. */
export function chordToKeys(combo: string): string[] {
  const tokens = combo.split("+").map((t) => t.trim()).filter((t) => t.length > 0);
  const chips: string[] = [];
  for (const tok of tokens) {
    const lower = tok.toLowerCase();
    if (lower === "$mod") {
      chips.push(isMac ? "Cmd" : "Ctrl");
    } else if (lower === "ctrl") {
      chips.push("Ctrl");
    } else if (lower === "meta") {
      chips.push("Cmd");
    } else if (SYMBOL[lower] !== undefined) {
      chips.push(SYMBOL[lower]);
    } else if (lower === "/" || lower === "?") {
      chips.push(tok);
    } else if (tok.length === 1) {
      chips.push(tok.toUpperCase());
    } else {
      chips.push(tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase());
    }
  }
  return chips;
}

/** Group entries by their section, preserving order. */
export function shortcutsBySection(): Record<ShortcutSection, ShortcutEntry[]> {
  const grouped: Record<ShortcutSection, ShortcutEntry[]> = {
    compose: [],
    navigation: [],
    misc: [],
  };
  for (const s of SHORTCUTS) {
    grouped[s.section].push(s);
  }
  return grouped;
}
