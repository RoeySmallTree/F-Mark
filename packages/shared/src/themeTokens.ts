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
  | "paper"
  | "paper-band"
  | "paper-sunk"
  | "ink"
  | "ink-2"
  | "ink-3"
  | "ink-4"
  | "line"
  | "line-2"
  | "line-3"
  | "rule"
  | "rule-strong"
  | "user"
  | "user-tint"
  | "user-tint-2"
  | "agent"
  | "agent-tint"
  | "agent-tint-2"
  | "green"
  | "green-tint"
  | "ledger"
  | "ledger-tint"
  | "ledger-tint-2"
  | "rose"
  | "alarm"
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
  bg: "#e9ecf3",
  canvas: "#ffffff",
  panel: "#f5f6fa",
  "panel-2": "#eceef5",
  paper: "#ffffff",
  "paper-band": "#f7f8fb",
  "paper-sunk": "#e9ecf3",
  ink: "#16181f",
  "ink-2": "#3d4456",
  "ink-3": "#5c6372",
  "ink-4": "#8b91a3",
  line: "rgb(16 20 34 / 11%)",
  "line-2": "rgb(16 20 34 / 7%)",
  "line-3": "rgb(16 20 34 / 4%)",
  rule: "rgb(16 20 34 / 11%)",
  "rule-strong": "rgb(16 20 34 / 19%)",
  user: "#4a5163",
  "user-tint": "rgb(74 81 99 / 10%)",
  "user-tint-2": "rgb(74 81 99 / 18%)",
  agent: "#0a6b5d",
  "agent-tint": "rgb(10 107 93 / 11%)",
  "agent-tint-2": "rgb(10 107 93 / 20%)",
  green: "#0a6b5d",
  "green-tint": "rgb(10 107 93 / 11%)",
  ledger: "#0a6b5d",
  "ledger-tint": "rgb(10 107 93 / 11%)",
  "ledger-tint-2": "rgb(10 107 93 / 20%)",
  rose: "#b02a44",
  alarm: "#b02a44",
  shadow: "0 1px 2px rgb(18 24 20 / 5%), 0 2px 6px -1px rgb(18 24 20 / 6%)",
  "shadow-2": "0 1px 2px rgb(18 24 20 / 5%), 0 6px 16px -4px rgb(18 24 20 / 10%), 0 18px 40px -12px rgb(18 24 20 / 14%)",
  sans: "\"IBM Plex Sans\", ui-sans-serif, system-ui, sans-serif",
  serif: "\"IBM Plex Sans\", ui-sans-serif, system-ui, sans-serif",
  mono: "\"IBM Plex Mono\", ui-monospace, SFMono-Regular, monospace",
  radius: "6px",
  "radius-lg": "10px",
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
    bg: "#0b0d16",
    canvas: "#12141f",
    panel: "#171a27",
    "panel-2": "#232736",
    paper: "#12141f",
    "paper-band": "#141724",
    "paper-sunk": "#0b0d16",
    ink: "#f0f1f7",
    "ink-2": "#bec3da",
    "ink-3": "#9298af",
    "ink-4": "#5b607a",
    line: "rgb(255 255 255 / 10%)",
    "line-2": "rgb(255 255 255 / 7%)",
    "line-3": "rgb(255 255 255 / 4%)",
    rule: "rgb(255 255 255 / 10%)",
    "rule-strong": "rgb(255 255 255 / 17%)",
    user: "#a8adc4",
    "user-tint": "rgb(168 173 196 / 14%)",
    "user-tint-2": "rgb(168 173 196 / 24%)",
    agent: "#5eead4",
    "agent-tint": "rgb(94 234 212 / 16%)",
    "agent-tint-2": "rgb(94 234 212 / 28%)",
    green: "#5eead4",
    "green-tint": "rgb(94 234 212 / 16%)",
    ledger: "#5eead4",
    "ledger-tint": "rgb(94 234 212 / 16%)",
    "ledger-tint-2": "rgb(94 234 212 / 28%)",
    rose: "#fb8fa0",
    alarm: "#fb8fa0",
    shadow: "0 1px 2px rgb(0 0 0 / 40%), 0 2px 6px -1px rgb(0 0 0 / 30%)",
    "shadow-2": "0 1px 2px rgb(0 0 0 / 50%), 0 6px 16px -4px rgb(0 0 0 / 45%), 0 18px 40px -12px rgb(0 0 0 / 55%)",
  },
  contrast: {
    bg: "#ffffff",
    canvas: "#ffffff",
    panel: "#ffffff",
    "panel-2": "#e8e8e8",
    paper: "#ffffff",
    "paper-band": "#f2f2f2",
    "paper-sunk": "#ffffff",
    ink: "#000000",
    "ink-2": "#1c1c1c",
    "ink-3": "#3d3d3d",
    "ink-4": "#000000",
    line: "#000000",
    "line-2": "#000000",
    "line-3": "#6b6b6b",
    rule: "#000000",
    "rule-strong": "#000000",
    user: "#000000",
    "user-tint": "#e8e8e8",
    "user-tint-2": "#d0d0d0",
    agent: "#005c33",
    "agent-tint": "#d9ebe1",
    "agent-tint-2": "#b3d7c4",
    green: "#005c33",
    "green-tint": "#d9ebe1",
    ledger: "#005c33",
    "ledger-tint": "#d9ebe1",
    "ledger-tint-2": "#b3d7c4",
    rose: "#a80000",
    alarm: "#a80000",
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
