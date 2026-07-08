/* Stale-chunk self-heal.
 *
 * The renderer ships as a hashed-chunk bundle (the kernel serves dist/). After a
 * rebuild the chunk hashes change, but an already-open tab still holds the OLD
 * module graph — so the first lazy import it triggers (terminal, editor, file
 * viewer, flow chart, …) 404s with:
 *   "Failed to fetch dynamically imported module: …/TerminalOverlay-<hash>.js".
 *
 * Vite fires a `vite:preloadError` event for exactly this case. We reload once
 * to pull the fresh module graph, which self-heals EVERY lazy import — not just
 * the one that happened to fail. A short cooldown prevents a reload loop when a
 * chunk is genuinely missing (a real build problem rather than staleness). */

const COOLDOWN_MS = 10_000;
const RELOAD_KEY = "fmark:stale-chunk-reload-at";

function recentlyReloaded(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? "0");
    return Number.isFinite(last) && Date.now() - last < COOLDOWN_MS;
  } catch {
    return false;
  }
}

/** Reload the page once to recover a stale module graph. No-ops if we already
 *  reloaded within the cooldown (so a genuinely-missing chunk can't loop). */
export function reloadForStaleChunk(): void {
  if (typeof window === "undefined") return;
  if (recentlyReloaded()) return;
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* sessionStorage unavailable — proceed without loop protection. */
  }
  window.location.reload();
}

/** True when an error/rejection is a failed dynamic-import (stale or missing
 *  lazy chunk). Mirrors the messages browsers use across engines. */
export function isDynamicImportError(reason: unknown): boolean {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "";
  return (
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /loading chunk \S+ failed/i.test(message)
  );
}

/** Install global self-heal for stale lazy-loaded chunks. Call once, early in
 *  boot (before any lazy import can fail). Safe to call in non-browser envs. */
export function installStaleChunkReload(): void {
  if (typeof window === "undefined") return;
  // Vite's own signal — fires when a preloaded chunk fails to load, before the
  // import() rejection surfaces to React.
  window.addEventListener("vite:preloadError", (event: Event) => {
    event.preventDefault();
    reloadForStaleChunk();
  });
  // Belt-and-suspenders: a dynamic import that rejects outside Vite's preload
  // path surfaces as an unhandled promise rejection.
  window.addEventListener("unhandledrejection", (event) => {
    if (isDynamicImportError(event.reason)) {
      event.preventDefault();
      reloadForStaleChunk();
    }
  });
}
