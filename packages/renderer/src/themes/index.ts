const NO_LOOSE_STRING_VALUES = {
  light: "light",
  theme: "theme-",
} as const;

/**
 * Theme manager — body-class swap + localStorage persistence + subscribers.
 *
 * The default theme is `'light'`, represented by NO class on `<body>` (so the
 * `:root` token block from tokens.css applies). Every other theme adds the
 * corresponding `theme-<name>` class.
 */

export type ThemeName =
  | "light"
  | "ember"
  | "terminal"
  | "ide"
  | "solarized"
  | "brutalist"
  | "cyber"
  | "amber"
  | "dracula"
  | "catppuccin"
  | "tokyo"
  | "gruvbox"
  | "nord"
  | "monokai"
  | "borland"
  | "sepia"
  | "contrast";

export const STORAGE_KEY = "fmark.theme";

export const THEMES: { name: ThemeName; label: string; description: string }[] =
  [
    {
      name: "light",
      label: "Light",
      description: "Warm paper canvas with soft ink, the default daytime look.",
    },
    {
      name: "ember",
      label: "Ember",
      description:
        "Plum-black with bright coral-red and warm amber, soft corners and a gentle glow. Matches the landing page.",
    },
    {
      name: "terminal",
      label: "Terminal",
      description: "Phosphor green on near-black with subtle scanline overlay.",
    },
    {
      name: "ide",
      label: "IDE Dark",
      description: "GitHub-style dark editor palette with cool greys and blues.",
    },
    {
      name: "solarized",
      label: "Solarized",
      description: "Classic Solarized Dark with a teal base and warm accents.",
    },
    {
      name: "brutalist",
      label: "Brutalist",
      description:
        "Pure black & white, monospace everywhere, thick borders, zero radius.",
    },
    {
      name: "cyber",
      label: "Cyberpunk",
      description:
        "Deep purple base with cyan/magenta neon gradients and glow.",
    },
    {
      name: "amber",
      label: "Amber CRT",
      description:
        "Monochrome amber phosphor on black, glow text and double-rule borders.",
    },
    {
      name: "dracula",
      label: "Dracula",
      description: "Muted purple base with cyan, pink and green accents.",
    },
    {
      name: "catppuccin",
      label: "Catppuccin Mocha",
      description:
        "Pastel mocha palette with soft lavender and pillowy rounded corners.",
    },
    {
      name: "tokyo",
      label: "Tokyo Night",
      description: "Inky blue-violet base with calm blue and purple roles.",
    },
    {
      name: "gruvbox",
      label: "Gruvbox",
      description: "Retro warm browns with mustard and orange, vintage contrast.",
    },
    {
      name: "nord",
      label: "Nord",
      description:
        "Arctic blue-grey polar night with frost cyan and aurora accents.",
    },
    {
      name: "monokai",
      label: "Monokai",
      description:
        "Olive-charcoal base with punchy pink, green and cyan. The Sublime classic.",
    },
    {
      name: "borland",
      label: "Borland Blue",
      description:
        "Turbo Pascal blue with yellow text, double borders and zero radius.",
    },
    {
      name: "sepia",
      label: "Sepia Paper",
      description:
        "Light parchment, all-serif and academic calm. The light alternative.",
    },
    {
      name: "contrast",
      label: "High Contrast",
      description:
        "Pure black with white, cyan and yellow, thick borders. The accessibility target.",
    },
  ];

const THEME_NAMES: ThemeName[] = THEMES.map((t) => t.name);

const subscribers = new Set<(name: ThemeName) => void>();

function isThemeName(value: unknown): value is ThemeName {
  return (
    typeof value === "string" && THEME_NAMES.includes(value as ThemeName)
  );
}

function safeStorageGet(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(value: string): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value);
  } catch {
    /* swallow — running in an env without localStorage */
  }
}

export function getCurrentTheme(): ThemeName {
  const raw = safeStorageGet();
  return isThemeName(raw) ? raw : NO_LOOSE_STRING_VALUES.light;
}

/**
 * Apply a theme: clears every existing `theme-*` class from `<body>` and (for
 * non-light themes) adds `theme-<name>`. Persists to localStorage (unless
 * `persist: false`) and notifies subscribers.
 *
 * `persist: false` is used by the cross-tab `storage` listener: another tab
 * already wrote localStorage, so re-persisting here is redundant and (worse)
 * could feed a loop if storage events ever reflected back.
 */
export function applyTheme(
  name: ThemeName,
  opts: { persist?: boolean } = {},
): void {
  const body = globalThis.document?.body;
  if (body !== undefined) {
    // Remove any prior theme-* class. We iterate from a snapshot because
    // classList is live and we are mutating it.
    const toRemove: string[] = [];
    body.classList.forEach((cls) => {
      if (cls.startsWith(NO_LOOSE_STRING_VALUES.theme)) toRemove.push(cls);
    });
    for (const cls of toRemove) body.classList.remove(cls);
    if (name !== NO_LOOSE_STRING_VALUES.light) body.classList.add(`theme-${name}`);
  }
  if (opts.persist !== false) safeStorageSet(name);
  for (const cb of subscribers) {
    try {
      cb(name);
    } catch {
      /* swallow subscriber errors so one bad listener cannot break others */
    }
  }
}

/**
 * Subscribe to theme changes. Returns an unsubscribe function.
 * The callback fires every time `applyTheme` is called (including no-ops).
 */
export function subscribeTheme(cb: (n: ThemeName) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/**
 * Live-apply theme changes made in OTHER browser tabs (X6 cross-tab sync).
 * The `storage` event fires only in tabs that did NOT make the write, so this
 * never sees its own `applyTheme`. We re-apply without persisting (the value
 * is already in localStorage) and let subscribers (ThemePicker, Appearance)
 * reflect the new selection. Returns an unsubscribe.
 *
 * Idempotent across calls: a single listener is shared (a no-op if already
 * started) so repeated invocations don't stack handlers.
 */
let themeStorageListening = false;
export function startThemeStorageSync(): () => void {
  if (typeof window === "undefined") return () => {};
  if (themeStorageListening) return () => {};
  themeStorageListening = true;
  const onStorage = (e: StorageEvent): void => {
    if (e.key !== STORAGE_KEY) return;
    const next = getCurrentTheme();
    applyTheme(next, { persist: false });
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
    themeStorageListening = false;
  };
}
