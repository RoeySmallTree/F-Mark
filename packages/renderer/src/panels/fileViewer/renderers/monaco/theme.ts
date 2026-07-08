import { useEffect, useState } from "react";

export type MonacoThemeMode = "light" | "dark";

const monacoThemeModes = {
  light: "light",
  dark: "dark",
} as const satisfies Record<string, MonacoThemeMode>;

const monacoThemeDom = {
  themeAttribute: "data-theme",
  darkMediaQuery: "(prefers-color-scheme: dark)",
} as const;

const monacoEditorThemes = {
  light: "vs",
  dark: "vs-dark",
} as const;

const DARK_THEME_RE = /dark|midnight|noir|matrix|aubergine/i;
const LIGHT_THEME_RE = /light|paper|cream|day/i;

function readMonacoThemeMode(): MonacoThemeMode {
  const theme =
    document.documentElement.getAttribute(monacoThemeDom.themeAttribute) ?? "";
  if (DARK_THEME_RE.test(theme)) return monacoThemeModes.dark;
  if (LIGHT_THEME_RE.test(theme)) return monacoThemeModes.light;
  return window.matchMedia?.(monacoThemeDom.darkMediaQuery).matches
    ? monacoThemeModes.dark
    : monacoThemeModes.light;
}

export function useMonacoThemeMode(): MonacoThemeMode {
  const [theme, setTheme] = useState<MonacoThemeMode>(() =>
    typeof document !== "undefined"
      ? readMonacoThemeMode()
      : monacoThemeModes.light,
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const obs = new MutationObserver(() => setTheme(readMonacoThemeMode()));
    obs.observe(root, {
      attributes: true,
      attributeFilter: [monacoThemeDom.themeAttribute],
    });
    return () => obs.disconnect();
  }, []);

  return theme;
}

export function monacoEditorTheme(theme: MonacoThemeMode): "vs" | "vs-dark" {
  return theme === monacoThemeModes.dark
    ? monacoEditorThemes.dark
    : monacoEditorThemes.light;
}
