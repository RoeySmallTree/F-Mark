const NO_LOOSE_STRING_VALUES = {
  compose: "compose",
  navigation: "navigation",
  misc: "misc",
} as const;

/* Shortcuts section — Settings → Keyboard shortcuts.
   Read-only listing of every keyboard binding in the app. The combo strings
   come from `shortcut-registry.ts` (which is hand-maintained to stay in
   sync with `useHotkeys` call sites in the codebase). */

import type { JSX } from "react";
import {
  chordToKeys,
  shortcutsBySection,
  type ShortcutSection,
} from "./shortcut-registry.js";

const SECTION_LABELS: Record<ShortcutSection, string> = {
  compose: "Compose",
  navigation: "Navigation",
  misc: "Misc",
};

export function Shortcuts(): JSX.Element {
  const grouped = shortcutsBySection();
  const sections: ShortcutSection[] = [NO_LOOSE_STRING_VALUES.compose, NO_LOOSE_STRING_VALUES.navigation, NO_LOOSE_STRING_VALUES.misc];

  return (
    <>
      <h3 className="settings-h">Keyboard shortcuts</h3>
      <div className="settings-sub">
        All bindings currently registered by the app. Cross-platform: ⌘ on
        macOS, Ctrl elsewhere.
      </div>
      <div className="kbd-grid">
        {sections.map((sec) => {
          const items = grouped[sec];
          if (items.length === 0) return null;
          return (
            <div key={sec}>
              <div className="kbd-section-h">{SECTION_LABELS[sec]}</div>
              {items.map((entry) => {
                const keys = chordToKeys(entry.combo);
                return (
                  <div
                    key={entry.combo}
                    className="kbd-row"
                    data-shortcut={entry.combo}
                  >
                    <span>{entry.description}</span>
                    <span className="kbd-keys">
                      {keys.map((k, i) => (
                        <kbd key={`${entry.combo}-${i}`}>{k}</kbd>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
