/**
 * Theme manager — body-class swap + localStorage persistence + subscribers.
 *
 * The default theme is `'light'`, represented by NO class on `<body>` (so the
 * `:root` token block from tokens.css applies). Every other theme adds the
 * corresponding `theme-<name>` class.
 */

export type ThemeName =
  | "light"
  | "terminal"
  | "ide"
  | "solarized"
  | "brutalist"
  | "cyber";

export const STORAGE_KEY = "fmark.theme";

export const THEMES: { name: ThemeName; label: string; description: string }[] =
  [
    {
      name: "light",
      label: "Light",
      description: "Warm paper canvas with soft ink — the default daytime look.",
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
      description: "Classic Solarized Dark — teal base, warm accents.",
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
  return isThemeName(raw) ? raw : "light";
}

/**
 * Apply a theme: clears every existing `theme-*` class from `<body>` and (for
 * non-light themes) adds `theme-<name>`. Persists to localStorage and notifies
 * subscribers.
 */
export function applyTheme(name: ThemeName): void {
  const body = globalThis.document?.body;
  if (body !== undefined) {
    // Remove any prior theme-* class. We iterate from a snapshot because
    // classList is live and we are mutating it.
    const toRemove: string[] = [];
    body.classList.forEach((cls) => {
      if (cls.startsWith("theme-")) toRemove.push(cls);
    });
    for (const cls of toRemove) body.classList.remove(cls);
    if (name !== "light") body.classList.add(`theme-${name}`);
  }
  safeStorageSet(name);
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
