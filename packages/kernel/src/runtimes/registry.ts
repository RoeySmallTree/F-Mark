import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { filterOfferableRuntimeEntries } from "@f-mark/shared";
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

function validateRuntimesFile(parsed: unknown): asserts parsed is RuntimesFile {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid .f-mark/runtimes.json: root must be an object");
  }
  const p = parsed as Partial<RuntimesFile>;
  if (typeof p.version !== "string") {
    throw new Error("invalid .f-mark/runtimes.json: version must be a string");
  }
  if (!p.runtimes || typeof p.runtimes !== "object" || Array.isArray(p.runtimes)) {
    throw new Error("invalid .f-mark/runtimes.json: runtimes must be an object");
  }
}

export async function loadRuntimes(fmarkDir: string): Promise<RuntimesFile> {
  const txt = await readFile(filePath(fmarkDir), "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(txt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid .f-mark/runtimes.json: ${msg}`);
  }
  validateRuntimesFile(parsed);
  for (const [, entry] of Object.entries(parsed.runtimes)) validateRuntimeEntry(entry);
  return parsed;
}

export function offerableRuntimesFile(cfg: RuntimesFile): RuntimesFile {
  return {
    version: cfg.version,
    runtimes: filterOfferableRuntimeEntries(cfg.runtimes),
  };
}

export async function loadOfferableRuntimes(fmarkDir: string): Promise<RuntimesFile> {
  return offerableRuntimesFile(await loadRuntimes(fmarkDir));
}

export async function saveRuntimes(fmarkDir: string, cfg: RuntimesFile): Promise<void> {
  await mkdir(fmarkDir, { recursive: true });
  validateRuntimesFile(cfg);
  for (const [, entry] of Object.entries(cfg.runtimes)) validateRuntimeEntry(entry);
  await writeFile(filePath(fmarkDir), JSON.stringify(cfg, null, 2), "utf8");
}

export async function initRuntimesFile(fmarkDir: string): Promise<void> {
  await mkdir(fmarkDir, { recursive: true });
  if (!(await exists(filePath(fmarkDir)))) {
    await saveRuntimes(fmarkDir, { version: VERSION, runtimes: { ...DEFAULT_RUNTIMES } });
    return;
  }
  const cfg = await loadRuntimes(fmarkDir);
  let changed = false;
  for (const [id, entry] of Object.entries(DEFAULT_RUNTIMES)) {
    if (cfg.runtimes[id] !== undefined) continue;
    cfg.runtimes[id] = entry;
    changed = true;
  }
  if (changed) await saveRuntimes(fmarkDir, cfg);
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
