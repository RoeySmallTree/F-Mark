import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";

export const MAX_LOG_BYTES = 1_048_576;

const PARTICIPANT_RE = /^[a-z][a-z0-9-]{0,63}$/;

function assertValid(id: string): void {
  if (!PARTICIPANT_RE.test(id)) {
    throw new Error(`invalid participant_id: ${id}`);
  }
}

function logPath(fmarkDir: string, id: string): string {
  return join(fmarkDir, "agents", id, "log.jsonl");
}

async function fileSize(p: string): Promise<number> {
  try {
    return (await stat(p)).size;
  } catch {
    return 0;
  }
}

export interface AgentLogEntry {
  ts: string;
  event: string;
  [k: string]: unknown;
}

export async function appendAgentLog(
  fmarkDir: string,
  id: string,
  entry: Omit<AgentLogEntry, "ts"> & { ts?: string },
): Promise<void> {
  assertValid(id);
  const p = logPath(fmarkDir, id);
  await mkdir(join(fmarkDir, "agents", id), { recursive: true });
  const size = await fileSize(p);
  if (size > MAX_LOG_BYTES) {
    await rename(p, `${p}.1`);
  }
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
  await appendFile(p, line, "utf8");
}

export async function readAgentLog(
  fmarkDir: string,
  id: string,
  opts: { limit?: number } = {},
): Promise<AgentLogEntry[]> {
  assertValid(id);
  const p = logPath(fmarkDir, id);
  let txt = "";
  try {
    txt = await readFile(p, "utf8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const lines = txt.split("\n").filter((l) => l.trim().length > 0);
  const limit = opts.limit ?? 50;
  const tail = lines.slice(-limit);
  return tail.map((l) => JSON.parse(l) as AgentLogEntry);
}
