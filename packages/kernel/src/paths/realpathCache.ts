import { realpathSync } from "node:fs";

/* Process-lifetime memo for realpathSync.

   canonical()/computePathId resolve every known root through realpathSync on
   essentially every scoped request (sessions, files, git, managed-agents …).
   With ~100 known roots (knownPaths + favorites + registered projects), that
   was ~200 *synchronous* realpath calls per request, each blocking the single
   Node event loop and serializing all concurrent requests — which is why even
   /health stalled for seconds while /sessions?scope=all ran.

   A root's canonical target is stable for the kernel's lifetime, so caching
   successful resolutions is safe and collapses the repeated blocking to one
   call per unique path. Failures (ENOENT for a not-yet-created path, etc.) are
   deliberately NOT cached so a path that appears later still resolves on the
   next call; the original error is rethrown for the caller to handle. */
const cache = new Map<string, string>();

export function cachedRealpathSync(absPath: string): string {
  const hit = cache.get(absPath);
  if (hit !== undefined) return hit;
  const resolved = realpathSync(absPath);
  cache.set(absPath, resolved);
  return resolved;
}
