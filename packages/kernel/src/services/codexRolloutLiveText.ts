import { open, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

interface JsonLine {
  timestamp?: unknown;
  type?: unknown;
  payload?: unknown;
}

export interface CodexLiveTextEntry {
  line: number;
  timestamp: string | null;
  content: string;
}

export function codexSessionsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const codexHome =
    typeof env.CODEX_HOME === "string" && env.CODEX_HOME.trim().length > 0
      ? env.CODEX_HOME
      : join(
          typeof env.HOME === "string" && env.HOME.trim().length > 0
            ? env.HOME
            : homedir(),
          ".codex",
        );
  return join(codexHome, "sessions");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(input: unknown, key: string): string | null {
  if (!isRecord(input)) return null;
  const value = input[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

async function listRecentRollouts(
  root: string,
  limit: number,
): Promise<Array<{ path: string; mtimeMs: number }>> {
  const found: Array<{ path: string; mtime: number }> = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full, depth + 1);
          return;
        }
        if (
          !entry.isFile() ||
          !entry.name.startsWith("rollout-") ||
          !entry.name.endsWith(".jsonl")
        ) {
          return;
        }
        try {
          const info = await stat(full);
          found.push({ path: full, mtime: info.mtimeMs });
        } catch {
          // Ignore files that rotate during the scan.
        }
      }),
    );
  }

  await walk(root, 0);
  found.sort((a, b) => b.mtime - a.mtime);
  return found.slice(0, limit).map((entry) => ({
    path: entry.path,
    mtimeMs: entry.mtime,
  }));
}

async function readPrefix(path: string, bytes = 1024 * 1024): Promise<string> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const result = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, result.bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function rolloutMetaCwd(prefix: string): string | null {
  const firstLine = prefix.split("\n").find((line) => line.trim().length > 0);
  if (firstLine === undefined) return null;
  try {
    const parsed = JSON.parse(firstLine) as JsonLine;
    if (parsed.type !== "session_meta" || !isRecord(parsed.payload)) return null;
    return stringField(parsed.payload, "cwd");
  } catch {
    return null;
  }
}

export async function findManagedCodexRollout(input: {
  sessionsRoot: string;
  projectRoot: string;
  participantId: string;
  sessionId: string;
  scanLimit?: number;
  notBeforeMs?: number;
}): Promise<string | null> {
  const files = await listRecentRollouts(input.sessionsRoot, input.scanLimit ?? 80);
  for (const file of files) {
    if (
      input.notBeforeMs !== undefined &&
      Number.isFinite(input.notBeforeMs) &&
      file.mtimeMs < input.notBeforeMs
    ) {
      continue;
    }
    let prefix: string;
    try {
      prefix = await readPrefix(file.path);
    } catch {
      continue;
    }
    if (rolloutMetaCwd(prefix) !== input.projectRoot) continue;
    if (!prefix.includes(input.participantId) || !prefix.includes(input.sessionId)) {
      continue;
    }
    if (!prefix.includes("fmark.launch") && !prefix.includes("fmark.wake")) {
      continue;
    }
    return file.path;
  }
  return null;
}

function liveTextFromEntry(entry: JsonLine): string | null {
  if (entry.type !== "event_msg" || !isRecord(entry.payload)) return null;
  if (stringField(entry.payload, "type") !== "agent_message") return null;
  if (stringField(entry.payload, "phase") !== "commentary") return null;
  return stringField(entry.payload, "message");
}

export async function readCodexLiveTextEntries(input: {
  rolloutPath: string;
  afterLine: number;
  notBeforeMs?: number;
}): Promise<{ nextLine: number; entries: CodexLiveTextEntry[] }> {
  let raw: string;
  try {
    raw = await readFile(input.rolloutPath, "utf8");
  } catch {
    return { nextLine: input.afterLine, entries: [] };
  }
  const parts = raw.split("\n");
  const completeLineCount = raw.endsWith("\n")
    ? parts.length - 1
    : Math.max(0, parts.length - 1);
  const entries: CodexLiveTextEntry[] = [];
  for (let index = input.afterLine; index < completeLineCount; index++) {
    const line = parts[index];
    if (line === undefined || line.trim().length === 0) continue;
    let parsed: JsonLine;
    try {
      parsed = JSON.parse(line) as JsonLine;
    } catch {
      continue;
    }
    const content = liveTextFromEntry(parsed);
    if (content === null) continue;
    const timestamp =
      typeof parsed.timestamp === "string" ? parsed.timestamp : null;
    if (
      input.notBeforeMs !== undefined &&
      Number.isFinite(input.notBeforeMs)
    ) {
      if (timestamp === null) continue;
      const timestampMs = Date.parse(timestamp);
      if (!Number.isFinite(timestampMs) || timestampMs < input.notBeforeMs) {
        continue;
      }
    }
    entries.push({
      line: index + 1,
      timestamp,
      content,
    });
  }
  return { nextLine: completeLineCount, entries };
}
