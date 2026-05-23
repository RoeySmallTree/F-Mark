import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_RUNTIMES } from "./defaults.js";
import { validateRuntimeEntry, type RuntimeEntryShape } from "./validation.js";

const FILE = "runtimes.json";
const VERSION = "1.0";

export interface RuntimesFile {
  version: string;
  runtimes: Record<string, RuntimeEntryShape>;
}

function filePath(fmarkDir: string): string { return join(fmarkDir, FILE); }

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

export async function loadRuntimes(fmarkDir: string): Promise<RuntimesFile> {
  const txt = await readFile(filePath(fmarkDir), "utf8");
  const parsed = JSON.parse(txt) as RuntimesFile;
  for (const [, entry] of Object.entries(parsed.runtimes ?? {})) validateRuntimeEntry(entry);
  return parsed;
}

export async function saveRuntimes(fmarkDir: string, cfg: RuntimesFile): Promise<void> {
  await mkdir(fmarkDir, { recursive: true });
  for (const [, entry] of Object.entries(cfg.runtimes)) validateRuntimeEntry(entry);
  await writeFile(filePath(fmarkDir), JSON.stringify(cfg, null, 2), "utf8");
}

export async function initRuntimesFile(fmarkDir: string): Promise<void> {
  await mkdir(fmarkDir, { recursive: true });
  if (await exists(filePath(fmarkDir))) return;
  await saveRuntimes(fmarkDir, { version: VERSION, runtimes: { ...DEFAULT_RUNTIMES } });
}

export async function upsertRuntime(
  fmarkDir: string,
  id: string,
  entry: RuntimeEntryShape,
): Promise<void> {
  validateRuntimeEntry(entry);
  const cfg = await loadRuntimes(fmarkDir);
  cfg.runtimes[id] = entry;
  await saveRuntimes(fmarkDir, cfg);
}

export async function removeRuntime(fmarkDir: string, id: string): Promise<void> {
  const cfg = await loadRuntimes(fmarkDir);
  delete cfg.runtimes[id];
  await saveRuntimes(fmarkDir, cfg);
}
