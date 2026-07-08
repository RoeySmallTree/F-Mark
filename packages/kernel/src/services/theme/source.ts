export type ThemeSource = "override" | "reported" | "default";

/**
 * Human note describing how a *non-default* theme was chosen, for the
 * design-doc intro. The `default` case (no client has reported a theme) is
 * handled separately in `designDoc.ts`, which emits a loud "no theme reported"
 * warning instead of a quiet parenthetical — so it is intentionally excluded
 * from this type.
 */
export function themeSourceNote(
  source: Exclude<ThemeSource, "default">,
): string {
  if (source === "override") {
    return "explicitly requested via the `theme` parameter";
  }
  return "currently applied in the app (reported by the renderer)";
}
