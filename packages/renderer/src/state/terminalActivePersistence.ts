/* Which terminal inner-tab is active, persisted per project (path_id). The
   terminals themselves persist in the live tmux daemon and rehydrate via
   GET /managed-agents; this only remembers the user's last-focused tab so the
   Terminal dock tab restores the same selection on reload. Keyed by path_id
   (falling back to a sentinel when no path is active). */

import { loadStringMap, saveJson } from "./storagePersistence.js";

const KEY = "fmark.activeTerminalByPath";
const NO_PATH = "__default__";

function keyFor(pathId: string | null): string {
  return pathId !== null && pathId.length > 0 ? pathId : NO_PATH;
}

export function loadActiveTerminal(pathId: string | null): string | null {
  return loadStringMap(KEY)[keyFor(pathId)] ?? null;
}

export function saveActiveTerminal(pathId: string | null, session: string): void {
  const map = loadStringMap(KEY);
  map[keyFor(pathId)] = session;
  saveJson(KEY, map);
}

/* Drop the stored selection for a path when it points at `session` (e.g. the
   active terminal was just killed), so a stale name isn't restored on reload. */
export function clearActiveTerminal(pathId: string | null, session: string): void {
  const map = loadStringMap(KEY);
  if (map[keyFor(pathId)] === session) {
    delete map[keyFor(pathId)];
    saveJson(KEY, map);
  }
}
