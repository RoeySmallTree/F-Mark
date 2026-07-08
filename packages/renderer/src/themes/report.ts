/**
 * Report the active theme to the kernel.
 *
 * The theme is chosen client-side and persisted only in localStorage, so the
 * kernel (which has no DOM) can't otherwise know which theme is on screen. The
 * `fmark_get_theme` MCP tool needs that to hand connected agents an on-brand
 * design document. This module PATCHes the applied theme + font set to
 * `PATCH /theme` on boot and on every change, so the tool reflects what the
 * user actually sees.
 *
 * Best-effort and fully isolated: failures are swallowed (the kernel simply
 * keeps its last value / default), and nothing here affects rendering.
 */

import { getCurrentFont, subscribeFont, type FontName } from "./fonts.js";
import { getCurrentTheme, subscribeTheme, type ThemeName } from "./index.js";

function authToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get("token");
  } catch {
    return null;
  }
}

function postAppearance(theme: ThemeName, font: FontName): void {
  if (typeof fetch === "undefined") return;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = authToken();
  if (token !== null && token.length > 0) headers.Authorization = `Bearer ${token}`;
  // Same-origin PATCH; ignore the result and any error.
  void fetch("/theme", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ theme, font }),
  }).catch(() => {});
}

/**
 * Start reporting the active appearance to the kernel: one immediate report plus
 * subscriptions for subsequent changes. Returns an unsubscribe function.
 */
export function startThemeReporting(): () => void {
  postAppearance(getCurrentTheme(), getCurrentFont());
  const unsubTheme = subscribeTheme((theme) => {
    postAppearance(theme, getCurrentFont());
  });
  const unsubFont = subscribeFont((font) => {
    postAppearance(getCurrentTheme(), font);
  });
  return () => {
    unsubTheme();
    unsubFont();
  };
}
