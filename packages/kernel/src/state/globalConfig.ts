import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { IntegrationPrefs, UserProfile } from "@f-mark/shared";
import type { GlobalPaths } from "../paths/global.js";

export type { IntegrationPrefs } from "@f-mark/shared";

export interface AllSessionEventsCursorEntry {
  path_id: string;
  path: string;
  session_id: string;
  last_checked_at: string;
  last_seen_event_at?: string;
}

export interface AllSessionEventsFilterCursor {
  updated_at: string;
  sessions: Record<string, AllSessionEventsCursorEntry>;
}

export interface AllSessionEventsConfig {
  schema: 1;
  cursors: Record<string, AllSessionEventsFilterCursor>;
}

export interface FMarkGlobalConfig extends Record<string, unknown> {
  allSessionEvents?: AllSessionEventsConfig;
  userProfile?: UserProfile;
  integrations?: Record<string, IntegrationPrefs>;
}

export async function readGlobalConfig(
  g: GlobalPaths,
): Promise<FMarkGlobalConfig> {
  try {
    const raw = await readFile(g.configFile(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("global config must be a JSON object");
    }
    return parsed as FMarkGlobalConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

export async function writeGlobalConfig(
  g: GlobalPaths,
  config: FMarkGlobalConfig,
): Promise<void> {
  const target = g.configFile();
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(config, null, 2), "utf8");
  await rename(tmp, target);
}

let mutex: Promise<void> = Promise.resolve();

async function acquire(): Promise<() => void> {
  let release!: () => void;
  const next = new Promise<void>((res) => {
    release = res;
  });
  const prev = mutex;
  mutex = next;
  await prev;
  return release;
}

export async function updateGlobalConfig(
  g: GlobalPaths,
  mutator: (config: FMarkGlobalConfig) => FMarkGlobalConfig,
): Promise<FMarkGlobalConfig> {
  const release = await acquire();
  try {
    const current = await readGlobalConfig(g);
    const next = mutator(current);
    await writeGlobalConfig(g, next);
    return next;
  } finally {
    release();
  }
}

export function ensureAllSessionEventsConfig(
  config: FMarkGlobalConfig,
): AllSessionEventsConfig {
  const existing = config.allSessionEvents;
  if (
    existing !== undefined &&
    existing.schema === 1 &&
    isRecord(existing.cursors)
  ) {
    return existing;
  }
  const next: AllSessionEventsConfig = { schema: 1, cursors: {} };
  config.allSessionEvents = next;
  return next;
}

export function ensureIntegrationsConfig(
  config: FMarkGlobalConfig,
): Record<string, IntegrationPrefs> {
  if (isRecord(config.integrations)) {
    return config.integrations as Record<string, IntegrationPrefs>;
  }
  const next: Record<string, IntegrationPrefs> = {};
  config.integrations = next;
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
