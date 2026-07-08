/* Cross-tab refresh signal for the Git/Diff base-ref override (X6).

   The base-ref override is a PROJECT setting that lives in the kernel project
   config (read by every renderer tab, standalone /file-tree, and direct git
   endpoints). When one tab saves a new override via PUT /git/diff-settings, the
   kernel state changes but other already-open tabs hold a stale
   `gitDiffSettingsByPathId` cache entry. There is no per-setting WS event, so we
   nudge other tabs through a localStorage `storage` event: the saver bumps a
   ping key, and every tab listens and re-fetches the settings for its own
   active scope.

   We intentionally piggy-back on `storage` (per X6: "saved settings/...base-ref
   via storage events") rather than inventing a kernel broadcast. The ping value
   is a monotonic-ish token (timestamp + path_id) so the event always fires even
   for repeat saves of the same value. */

const PING_KEY = "fmark.gitDiffSettings.ping";

/** Bump the cross-tab ping so other tabs re-fetch the base-ref settings. Call
 *  this right after a successful PUT /git/diff-settings. No-op without
 *  localStorage. */
export function pingGitDiffSettings(pathId: string): void {
  try {
    globalThis.localStorage?.setItem(
      PING_KEY,
      `${Date.now()}:${pathId}`,
    );
  } catch {
    /* swallow — no localStorage */
  }
}

/** Subscribe to cross-tab base-ref ping events. `onPing(pathId)` fires with the
 *  path_id that was saved in another tab (callers compare it to their own scope
 *  and re-fetch when relevant). Returns an unsubscribe. No-op outside a window.
 */
export function subscribeGitDiffSettingsPing(
  onPing: (pathId: string | null) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent): void => {
    if (e.key !== PING_KEY || e.newValue === null) return;
    const sep = e.newValue.indexOf(":");
    const pathId = sep >= 0 ? e.newValue.slice(sep + 1) : null;
    onPing(pathId !== null && pathId.length > 0 ? pathId : null);
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
