/**
 * Theme token registry — the server-readable mirror of the renderer's
 * `packages/renderer/src/themes/tokens.css`.
 *
 * Why a structured copy?
 *   The kernel has no DOM, so it cannot read CSS custom properties from a
 *   live `:root`/`body.theme-*` rule. The `fmark_get_theme` MCP tool needs
 *   the resolved token values to build an on-brand design document for
 *   connected agents. Rather than parse CSS at runtime (the renderer isn't a
 *   kernel dependency and CSS isn't importable in Node), we keep a typed copy
 *   here in `@f-mark/shared`, consumed by the kernel theme service.
 *
 *   Drift is guarded by a kernel test that re-parses the actual tokens.css
 *   file and asserts every value here matches — so this registry can never
 *   silently diverge from what the app ships.
 *
 * Values are copied VERBATIM from tokens.css. `THEME_BASE_TOKENS` is the
 * `:root` block (the default `light` theme); each `THEME_OVERRIDES[name]` is
 * the delta applied by `body.theme-<name>`. Resolve a theme by spreading the
 * base then the overrides (see `resolveThemeTokens`).
 */

export type ThemeTokenName = "light" | "night" | "contrast";

/** The canonical default theme — the `:root` block, rendered with no body class. */
export const DEFAULT_THEME: ThemeTokenName = "light";

/** Display metadata for each theme, mirrored from the renderer THEMES registry. */
export interface ThemeMeta {
  name: ThemeTokenName;
  label: string;
  description: string;
}

export const THEME_META: Record<ThemeTokenName, ThemeMeta> = {
  light: {
    name: "light",
    label: "Day",
    description:
      "Cool paper with deep ink and a single ledger green. The default sheet.",
  },
  night: {
    name: "night",
    label: "Night",
    description:
      "The same ruled sheet after dark — banding and hairlines stay visible.",
  },
  contrast: {
    name: "contrast",
    label: "High contrast",
    description:
      "Pure black on white with thick rules. Clears WCAG AAA for body text.",
  },
};

/** Ordered list of theme names, matching the renderer THEMES order. */
export const THEME_NAMES: ThemeTokenName[] = ["light", "night", "contrast"];

/**
 * The complete set of token keys tracked here (without the leading `--`).
 * Every theme resolves to a value for each of these.
 */
export type ThemeTokenKey =
  | "bg"
  | "canvas"
  | "panel"
  | "panel-2"
  | "ink"
  | "ink-2"
  | "ink-3"
  | "ink-4"
  | "line"
  | "line-2"
  | "line-3"
  | "user"
  | "user-tint"
  | "user-tint-2"
  | "agent"
  | "agent-tint"
  | "agent-tint-2"
  | "green"
  | "green-tint"
  | "rose"
  | "shadow"
  | "shadow-2"
  | "sans"
  | "serif"
  | "mono"
  | "radius"
  | "radius-lg"
  | "radius-pill"
  | "border-w";

export type ThemeTokens = Record<ThemeTokenKey, string>;

/**
 * The `:root` block from tokens.css — the default `light` theme. Every other
 * theme is expressed as a partial override of these values.
 */
export const THEME_BASE_TOKENS: ThemeTokens = {
  bg: "#edf0ee",
  canvas: "#f7f8f7",
  panel: "#f1f4f2",
  "panel-2": "#e7ece9",
  ink: "#141a16",
  "ink-2": "#46514a",
  "ink-3": "#75817a",
  "ink-4": "#9aa69e",
  line: "#dde3de",
  "line-2": "#e6eae7",
  "line-3": "#eff2f0",
  user: "#1f2a23",
  "user-tint": "#eaedeb",
  "user-tint-2": "#d8ded9",
  agent: "#0e6b45",
  "agent-tint": "#e0efe7",
  "agent-tint-2": "#c5e2d3",
  green: "#0e6b45",
  "green-tint": "#e0efe7",
  rose: "#a32a20",
  shadow: "0 0 0 1px #dde3de",
  "shadow-2": "0 0 0 1px #c2cbc4, 0 8px 24px -12px rgb(20 26 22 / 18%)",
  sans: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
  serif: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
  radius: "3px",
  "radius-lg": "5px",
  "radius-pill": "999px",
  "border-w": "1px",
};

/**
 * Per-theme deltas applied on top of `THEME_BASE_TOKENS`. Copied verbatim from
 * each `body.theme-<name>` block in tokens.css. `light` has no overrides.
 */
export const THEME_OVERRIDES: Record<
  ThemeTokenName,
  Partial<ThemeTokens>
> = {
  light: {},
  night: {
    bg: "#0a0d0b",
    canvas: "#0e1210",
    panel: "#111614",
    "panel-2": "#1a221d",
    ink: "#e6ede8",
    "ink-2": "#a3b0a8",
    "ink-3": "#74827a",
    "ink-4": "#4d584f",
    line: "#232c27",
    "line-2": "#1b221e",
    "line-3": "#151b17",
    user: "#dfe7e2",
    "user-tint": "#171d1a",
    "user-tint-2": "#232c27",
    agent: "#58b98a",
    "agent-tint": "#12241b",
    "agent-tint-2": "#1d3a2b",
    green: "#58b98a",
    "green-tint": "#12241b",
    rose: "#e8695c",
    shadow: "0 0 0 1px #232c27",
    "shadow-2": "0 0 0 1px #35413a, 0 8px 24px -12px rgb(0 0 0 / 60%)",
  },
  contrast: {
    bg: "#ffffff",
    canvas: "#ffffff",
    panel: "#ffffff",
    "panel-2": "#e8e8e8",
    ink: "#000000",
    "ink-2": "#1c1c1c",
    "ink-3": "#3d3d3d",
    "ink-4": "#000000",
    line: "#000000",
    "line-2": "#000000",
    "line-3": "#6b6b6b",
    user: "#000000",
    "user-tint": "#e8e8e8",
    "user-tint-2": "#d0d0d0",
    agent: "#005c33",
    "agent-tint": "#d9ebe1",
    "agent-tint-2": "#b3d7c4",
    green: "#005c33",
    "green-tint": "#d9ebe1",
    rose: "#a80000",
    shadow: "0 0 0 2px #000000",
    "shadow-2": "0 0 0 2px #000000",
    radius: "0px",
    "radius-lg": "0px",
    "border-w": "2px",
  },
};

/** Type guard for an arbitrary string being a known theme name. */
export function isThemeName(value: unknown): value is ThemeTokenName {
  return typeof value === "string" && value in THEME_META;
}

/**
 * Resolve the fully-merged token set for a theme: the `:root` base with the
 * theme's overrides applied on top. Unknown names fall back to the default.
 */
export function resolveThemeTokens(name: ThemeTokenName): ThemeTokens {
  return { ...THEME_BASE_TOKENS, ...THEME_OVERRIDES[name] };
}
