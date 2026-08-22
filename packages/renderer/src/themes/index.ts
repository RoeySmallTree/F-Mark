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

/* Three themes, each fully audited for contrast, rather than seventeen that
   nothing could hold to a standard. `light` is the Ledger day sheet and
   carries no body class, so :root in tokens.css applies. */
export type ThemeName = "light" | "night" | "contrast";

/* Themes retired in the Ledger redesign. Anything persisted in localStorage
   from a previous version resolves through this map instead of silently
   falling back, so a returning user lands on the nearest survivor rather than
   being yanked to the default. */
const RETIRED_THEME_ALIASES: Record<string, ThemeName> = {
  ember: "night",
  terminal: "night",
  ide: "night",
  solarized: "night",
  cyber: "night",
  amber: "night",
  dracula: "night",
  catppuccin: "night",
  tokyo: "night",
  gruvbox: "night",
  nord: "night",
  monokai: "night",
  borland: "night",
  brutalist: "contrast",
  sepia: "light",
};

export const STORAGE_KEY = "fmark.theme";

export const THEMES: { name: ThemeName; label: string; description: string }[] =
  [
    {
      name: "light",
      label: "Day",
      description:
        "Cool paper with deep ink and a single ledger green. The default sheet.",
    },
    {
      name: "night",
      label: "Night",
      description:
        "The same ruled sheet after dark — banding and hairlines stay visible.",
    },
    {
      name: "contrast",
      label: "High contrast",
      description:
        "Pure black on white with thick rules. Clears WCAG AAA for body text.",
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

/* Resolve a stored value to a live theme: an exact match wins, a retired name
   maps to its nearest survivor, anything else falls back to the default. */
function resolveThemeName(raw: unknown): ThemeName {
  if (isThemeName(raw)) return raw;
  if (typeof raw === "string" && raw in RETIRED_THEME_ALIASES) {
    return RETIRED_THEME_ALIASES[raw] as ThemeName;
  }
  return NO_LOOSE_STRING_VALUES.light;
}

export function getCurrentTheme(): ThemeName {
  return resolveThemeName(safeStorageGet());
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
