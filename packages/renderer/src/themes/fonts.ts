import {
  DEFAULT_FONT,
  FONT_META,
  FONT_NAMES,
  isFontName,
  type FontTokenName,
} from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  fontPreset: "font-preset-",
} as const;

/**
 * Font manager — optional typography override layered on top of the selected
 * color theme. The default is `theme`, which means no body class: the active
 * theme's `--sans`, `--serif`, and `--mono` tokens remain authoritative.
 */

export type FontName = FontTokenName;

export const STORAGE_KEY = "fmark.font";

export const FONT_PRESETS = FONT_NAMES.map((name) => FONT_META[name]);

const subscribers = new Set<(name: FontName) => void>();

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

export function getCurrentFont(): FontName {
  const raw = safeStorageGet();
  return isFontName(raw) ? raw : DEFAULT_FONT;
}

export function applyFont(
  name: FontName,
  opts: { persist?: boolean } = {},
): void {
  const body = globalThis.document?.body;
  if (body !== undefined) {
    const toRemove: string[] = [];
    body.classList.forEach((cls) => {
      if (cls.startsWith(NO_LOOSE_STRING_VALUES.fontPreset)) toRemove.push(cls);
    });
    for (const cls of toRemove) body.classList.remove(cls);
    if (name !== DEFAULT_FONT) {
      body.classList.add(`${NO_LOOSE_STRING_VALUES.fontPreset}${name}`);
    }
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

export function subscribeFont(cb: (n: FontName) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

let fontStorageListening = false;
export function startFontStorageSync(): () => void {
  if (typeof window === "undefined") return () => {};
  if (fontStorageListening) return () => {};
  fontStorageListening = true;
  const onStorage = (e: StorageEvent): void => {
    if (e.key !== STORAGE_KEY) return;
    applyFont(getCurrentFont(), { persist: false });
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
    fontStorageListening = false;
  };
}
