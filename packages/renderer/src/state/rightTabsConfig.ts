import { loadMap, saveJson, storageGet } from "./storagePersistence.js";

export type RightTabKey =
  | "todos"
  | "comments"
  | "named"
  | "agents"
  | "log"
  | "files"
  | "diffTree"
  | "terminal";

/* The right pane can also show the Layout settings tab. That key is
   intentionally NOT in RightTabKey so it stays out of persistence /
   reorder configs - only `rightTab` and `setRightTab` accept it. */
export type RightPanelView = RightTabKey | "layout";

export const RIGHT_TAB_IDS = {
  todos: "todos",
  comments: "comments",
  named: "named",
  agents: "agents",
  log: "log",
  files: "files",
  diffTree: "diffTree",
  terminal: "terminal",
} as const satisfies Record<string, RightTabKey>;

/* Per-tab config used by the Layout settings tab. The order of the array
   IS the order of buttons in the right-tab strip. Layout itself is never
   in this array - it is rendered separately at the end of the strip. */
export interface RightTabConfigEntry {
  key: RightTabKey;
  enabled: boolean;
}
export type RightTabConfig = ReadonlyArray<RightTabConfigEntry>;

export const RIGHT_TABS_CONFIG_STORAGE_KEY = "fmark.rightTabsConfig";
export const RIGHT_TABS_CONFIG_BY_SESSION_STORAGE_KEY =
  "fmark.rightTabsConfigBySession";

export const DEFAULT_RIGHT_TABS_CONFIG: RightTabConfig = [
  { key: "todos", enabled: true },
  { key: "comments", enabled: true },
  { key: "named", enabled: true },
  { key: "agents", enabled: true },
  { key: "log", enabled: true },
  { key: "files", enabled: true },
  { key: "diffTree", enabled: true },
  { key: "terminal", enabled: true },
];

const RIGHT_TAB_KEYS: RightTabKey[] = [
  "todos",
  "comments",
  "named",
  "agents",
  "log",
  "files",
  "diffTree",
  "terminal",
];

export function isRightTabKey(value: unknown): value is RightTabKey {
  return (
    typeof value === "string" && (RIGHT_TAB_KEYS as string[]).includes(value)
  );
}

/* Reconcile a stored config against the current set of known tab keys:
   - drop entries with unknown keys (e.g. tab removed in a future release),
   - dedupe by key (keep first occurrence),
   - append missing keys at the end as enabled so newly-added tabs are visible.
   Returns a fresh array; never mutates the input. */
function reconcileRightTabsConfig(input: unknown): RightTabConfig {
  if (!Array.isArray(input)) return DEFAULT_RIGHT_TABS_CONFIG;
  const seen = new Set<RightTabKey>();
  const out: RightTabConfigEntry[] = [];
  for (const raw of input) {
    if (raw === null || typeof raw !== "object") continue;
    const key = (raw as { key?: unknown }).key;
    const enabled = (raw as { enabled?: unknown }).enabled;
    if (!isRightTabKey(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, enabled: enabled !== false });
  }
  for (const def of DEFAULT_RIGHT_TABS_CONFIG) {
    if (!seen.has(def.key)) out.push({ key: def.key, enabled: true });
  }
  return out;
}

export function loadRightTabsConfig(): RightTabConfig {
  try {
    const raw = storageGet(RIGHT_TABS_CONFIG_STORAGE_KEY);
    if (raw === null || raw === undefined) return DEFAULT_RIGHT_TABS_CONFIG;
    return reconcileRightTabsConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_RIGHT_TABS_CONFIG;
  }
}

export function saveRightTabsConfig(config: RightTabConfig): void {
  saveJson(RIGHT_TABS_CONFIG_STORAGE_KEY, config);
}

export function loadRightTabsConfigBySession(): Record<string, RightTabConfig> {
  return loadMap(RIGHT_TABS_CONFIG_BY_SESSION_STORAGE_KEY, (value) =>
    reconcileRightTabsConfig(value),
  );
}

export function saveRightTabsConfigBySession(
  map: Record<string, RightTabConfig>,
): void {
  saveJson(RIGHT_TABS_CONFIG_BY_SESSION_STORAGE_KEY, map);
}

/* Pick the effective config for the current session: per-session override
   when one exists, otherwise the global config. */
export function resolveRightTabsConfig(
  global: RightTabConfig,
  bySession: Record<string, RightTabConfig>,
  sid: string | null,
): RightTabConfig {
  if (sid !== null) {
    const override = bySession[sid];
    if (override !== undefined) return override;
  }
  return global;
}

/* Move `fromKey` so it sits at the position currently occupied by `toKey`.
   No-op when from === to or either key is absent. Pure. */
export function reorderRightTabsConfig(
  config: RightTabConfig,
  fromKey: RightTabKey,
  toKey: RightTabKey,
): RightTabConfig {
  if (fromKey === toKey) return config;
  const fromIdx = config.findIndex((entry) => entry.key === fromKey);
  const toIdx = config.findIndex((entry) => entry.key === toKey);
  if (fromIdx < 0 || toIdx < 0) return config;
  const next = config.slice();
  const [moved] = next.splice(fromIdx, 1);
  if (moved === undefined) return config;
  next.splice(toIdx, 0, moved);
  return next;
}

/* Toggle the enabled flag for `key`. Refuses to toggle the last enabled
   entry off so the strip is never empty. */
export function toggleRightTabsConfig(
  config: RightTabConfig,
  key: RightTabKey,
): RightTabConfig {
  const idx = config.findIndex((entry) => entry.key === key);
  if (idx < 0) return config;
  const current = config[idx]!;
  if (current.enabled) {
    const enabledCount = config.reduce(
      (count, entry) => (entry.enabled ? count + 1 : count),
      0,
    );
    if (enabledCount <= 1) return config;
  }
  const next = config.slice();
  next[idx] = { key: current.key, enabled: !current.enabled };
  return next;
}

/* True when `key` is the sole enabled entry - used by the Layout UI to
   disable that row's checkbox. */
export function isOnlyEnabledRightTab(
  config: RightTabConfig,
  key: RightTabKey,
): boolean {
  let enabledCount = 0;
  let target: RightTabConfigEntry | undefined;
  for (const entry of config) {
    if (entry.enabled) enabledCount++;
    if (entry.key === key) target = entry;
  }
  return target?.enabled === true && enabledCount === 1;
}
