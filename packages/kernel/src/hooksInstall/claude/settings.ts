import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface ClaudeSettingsStatus {
  exists: boolean;
  settings: unknown;
  error?: string;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function readClaudeSettingsForStatus(
  configPath: string,
): Promise<ClaudeSettingsStatus> {
  try {
    const raw = await readFile(configPath, "utf8");
    return parseSettingsStatus(raw);
  } catch (err) {
    if (isMissingPathError(err)) return { exists: false, settings: {} };
    return {
      exists: true,
      settings: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function readSettingsForWrite(
  configPath: string,
): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(configPath, "utf8");
    if (raw.trim().length === 0) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) throw new Error("settings root must be an object");
    return parsed;
  } catch (err) {
    if (isMissingPathError(err)) return {};
    throw err;
  }
}

export async function writeSettingsIfChanged(
  configPath: string,
  settings: Record<string, unknown>,
  before: string,
): Promise<boolean> {
  const after = JSON.stringify(settings);
  if (before === after) return false;

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return true;
}

function parseSettingsStatus(raw: string): ClaudeSettingsStatus {
  try {
    return { exists: true, settings: JSON.parse(raw) };
  } catch (err) {
    return {
      exists: true,
      settings: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function isMissingPathError(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
