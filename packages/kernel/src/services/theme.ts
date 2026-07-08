/**
 * Theme design-document service.
 *
 * Resolves a theme name to its token values (via the `@f-mark/shared`
 * registry that mirrors the renderer's tokens.css) and formats a markdown
 * **design document** an agent can read to generate on-brand HTML — palette,
 * buttons, radii, typography, and component recipes (card / input / badge /
 * link) with both resolved values AND copy-paste HTML/CSS snippets.
 *
 * The component recipes are synthesized from the same design intent the app's
 * own CSS encodes (modals.css `.btn-solid`/`.btn-ghost`/`.form-input`,
 * cards.css `.prose-card`/`.badge`, render.css prose links), but rewritten as
 * SELF-CONTAINED snippets using resolved hex/length values rather than the
 * app's internal class names — because agent-authored HTML is standalone and
 * cannot rely on the app stylesheet.
 */

import {
  DEFAULT_FONT,
  DEFAULT_THEME,
  isFontName,
  isThemeName,
  type FontTokenName,
  type ThemeTokenName,
} from "@f-mark/shared";
import {
  renderThemeDesignDoc,
  type ThemeSource,
} from "./theme/designDoc.js";

/** In-memory record of the appearance last reported by the renderer (per process). */
let reportedTheme: ThemeTokenName = DEFAULT_THEME;
let reportedFont: FontTokenName = DEFAULT_FONT;

/**
 * Whether a renderer has reported a theme this process. Tracked separately from
 * the value so a genuine "renderer reported Light" is distinguishable from
 * "no client has reported yet" — the latter must stay `source: "default"` so
 * the loud fallback fires and the launch packet flags the theme as unconfirmed.
 */
let themeReported = false;
let fontReported = false;

/** Record the active theme reported by the renderer. Unknown names are ignored. */
export function setReportedTheme(name: string): boolean {
  if (!isThemeName(name)) return false;
  reportedTheme = name;
  themeReported = true;
  return true;
}

/** Record the active font set reported by the renderer. Unknown names are ignored. */
export function setReportedFont(name: string): boolean {
  if (!isFontName(name)) return false;
  reportedFont = name;
  fontReported = true;
  return true;
}

/** Record a renderer appearance report atomically. */
export function setReportedAppearance(
  theme: string,
  font?: string,
): { ok: true } | { ok: false; error: string } {
  if (!isThemeName(theme)) return { ok: false, error: `unknown theme: ${theme}` };
  if (font !== undefined && !isFontName(font)) {
    return { ok: false, error: `unknown font: ${font}` };
  }
  reportedTheme = theme;
  themeReported = true;
  if (font !== undefined) {
    reportedFont = font;
    fontReported = true;
  }
  return { ok: true };
}

/** Reset report state (renderer disconnect / test isolation). */
export function resetReportedTheme(): void {
  reportedTheme = DEFAULT_THEME;
  reportedFont = DEFAULT_FONT;
  themeReported = false;
  fontReported = false;
}

/** The theme the renderer last reported as applied (defaults to `light`). */
export function getReportedTheme(): ThemeTokenName {
  return reportedTheme;
}

/** The font set the renderer last reported as applied (defaults to theme). */
export function getReportedFont(): FontTokenName {
  return reportedFont;
}

/**
 * Resolve which theme to document: an explicit override wins (when it names a
 * known theme), otherwise the renderer-reported active theme, otherwise the
 * default. Returns the resolved name plus how it was chosen, for transparency
 * in the rendered doc.
 */
export function resolveActiveTheme(override?: string): {
  name: ThemeTokenName;
  source: ThemeSource;
} {
  const trimmed = override?.trim();
  if (trimmed !== undefined && trimmed.length > 0) {
    if (!isThemeName(trimmed)) {
      throw new Error(`unknown theme: ${trimmed}`);
    }
    return { name: trimmed, source: "override" };
  }
  if (themeReported) {
    return { name: reportedTheme, source: "reported" };
  }
  return { name: DEFAULT_THEME, source: "default" };
}

/** Resolve which font set to document. `theme` means the resolved theme's stacks. */
export function resolveActiveFont(override?: string): {
  name: FontTokenName;
  source: ThemeSource;
} {
  const trimmed = override?.trim();
  if (trimmed !== undefined && trimmed.length > 0) {
    if (!isFontName(trimmed)) {
      throw new Error(`unknown font: ${trimmed}`);
    }
    return { name: trimmed, source: "override" };
  }
  if (fontReported) {
    return { name: reportedFont, source: "reported" };
  }
  return { name: DEFAULT_FONT, source: "default" };
}

/** Build the design-document markdown for a resolved theme + font set. */
function buildThemeDesignDoc(
  name: ThemeTokenName,
  source: ThemeSource,
  font: FontTokenName,
  fontSource: ThemeSource,
): string {
  return renderThemeDesignDoc(name, source, font, fontSource);
}

/** Convenience: resolve + format in one call. */
export function buildActiveThemeDoc(
  override?: string,
  fontOverride?: string,
): {
  theme: ThemeTokenName;
  source: ThemeSource;
  font: FontTokenName;
  fontSource: ThemeSource;
  markdown: string;
} {
  const { name, source } = resolveActiveTheme(override);
  const { name: font, source: fontSource } = resolveActiveFont(fontOverride);
  return {
    theme: name,
    source,
    font,
    fontSource,
    markdown: buildThemeDesignDoc(name, source, font, fontSource),
  };
}
