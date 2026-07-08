import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import type { CurrentRuntimeState } from "@f-mark/shared";
import type { AdapterReadContext } from "../types.js";

interface CodexRolloutReaderOptions {
  sessionsRoot: string;
  scanLimit: number;
}

interface SessionMetaLine {
  type?: string;
  payload?: { cwd?: string };
}

interface TurnContextLine {
  type?: string;
  payload?: Record<string, unknown>;
}

interface RolloutRuntimeDraft {
  model?: string;
  effort?: string;
}

export function createCodexRolloutReader({
  sessionsRoot,
  scanLimit,
}: CodexRolloutReaderOptions) {
  async function readCurrent(
    ctx: AdapterReadContext,
  ): Promise<CurrentRuntimeState | null> {
    if (ctx.transcriptPath) {
      const state = await readFromRollout(ctx.transcriptPath);
      if (state) return state;
    }

    if (!ctx.cwd) return null;
    const found = await findLatestRolloutForCwd(ctx.cwd, sessionsRoot, scanLimit);
    return found ? readFromRollout(found) : null;
  }

  return { readCurrent };
}

async function findLatestRolloutForCwd(
  targetCwd: string,
  sessionsRoot: string,
  scanLimit: number,
): Promise<string | null> {
  const files = await safeListRecentRollouts(sessionsRoot, scanLimit);

  for (const file of files) {
    if (await rolloutMatchesCwd(file, targetCwd)) {
      return file;
    }
  }

  return null;
}

async function safeListRecentRollouts(
  root: string,
  limit: number,
): Promise<string[]> {
  try {
    return await listRecentRollouts(root, limit);
  } catch {
    return [];
  }
}

async function rolloutMatchesCwd(file: string, targetCwd: string): Promise<boolean> {
  try {
    const raw = await readFile(file, "utf8");
    const entry = parseSessionMetaLine(firstContentLine(raw));
    return entry?.payload?.cwd === targetCwd;
  } catch {
    return false;
  }
}

async function listRecentRollouts(root: string, limit: number): Promise<string[]> {
  const found: { path: string; mtime: number }[] = [];
  await collectRolloutFiles(root, found);
  found.sort((a, b) => b.mtime - a.mtime);
  return found.slice(0, limit).map((file) => file.path);
}

async function collectRolloutFiles(
  dir: string,
  out: { path: string; mtime: number }[],
  depth = 0,
): Promise<void> {
  if (depth > 4) return;

  const entries = await safeReadDir(dir);
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectRolloutFiles(full, out, depth + 1);
    } else if (entry.isFile() && isRolloutFile(entry.name)) {
      await pushRolloutFile(full, out);
    }
  }
}

async function safeReadDir(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function isRolloutFile(name: string): boolean {
  return name.startsWith("rollout-") && name.endsWith(".jsonl");
}

async function pushRolloutFile(
  path: string,
  out: { path: string; mtime: number }[],
): Promise<void> {
  try {
    const fileStat = await stat(path);
    out.push({ path, mtime: fileStat.mtimeMs });
  } catch {
    // Skip files that disappear while scanning.
  }
}

async function readFromRollout(
  path: string,
): Promise<CurrentRuntimeState | null> {
  const raw = await safeReadFile(path);
  if (raw === null) return null;

  const draft = lastRuntimeDraft(raw);
  if (!draft.model && !draft.effort) return null;

  return {
    model: draft.model,
    effort: draft.effort,
    source: "rollout",
    observedAt: Date.now(),
  };
}

async function safeReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function lastRuntimeDraft(raw: string): RolloutRuntimeDraft {
  const draft: RolloutRuntimeDraft = {};

  for (const line of raw.split("\n")) {
    const entry = parseTurnContextLine(line);
    if (!entry?.payload) continue;
    applyRuntimePayload(entry.payload, draft);
  }

  return draft;
}

function applyRuntimePayload(
  payload: Record<string, unknown>,
  draft: RolloutRuntimeDraft,
): void {
  const model = payload.model;
  const effort = payload.effort ?? payload.reasoning_effort;

  if (typeof model === "string") draft.model = model;
  if (typeof effort === "string") draft.effort = effort;
}

function firstContentLine(raw: string): string | null {
  return raw.split("\n").find((line) => line.trim().length > 0) ?? null;
}

function parseSessionMetaLine(line: string | null): SessionMetaLine | null {
  const parsed = parseJsonLine<SessionMetaLine>(line);
  return parsed?.type === "session_meta" ? parsed : null;
}

function parseTurnContextLine(line: string): TurnContextLine | null {
  const parsed = parseJsonLine<TurnContextLine>(line);
  return parsed?.type === "turn_context" ? parsed : null;
}

function parseJsonLine<T>(line: string | null): T | null {
  if (!line?.trim()) return null;

  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}
