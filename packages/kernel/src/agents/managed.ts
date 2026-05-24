import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PARTICIPANT_RE = /^[a-z][a-z0-9-]{0,63}$/;

function assertValid(id: string): void {
  if (!PARTICIPANT_RE.test(id)) {
    throw new Error(`invalid participant_id: ${id}`);
  }
}

function agentDir(agentsDir: string, id: string): string {
  return join(agentsDir, id);
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readOrNull(p: string): Promise<string | null> {
  try {
    const txt = await readFile(p, "utf8");
    const trimmed = txt.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/* `agentsDir` is the directory that contains per-agent subdirs (each named
   after a participant id). v0.4 path: `<root>/.f-mark/agents`. v0.5 path:
   `~/.config/f-mark/projects/<pathId>/agents`. Callers compute the right
   value via a resolver in routes/managedAgents.ts. */

export async function writeTmuxSession(
  agentsDir: string,
  id: string,
  name: string,
): Promise<void> {
  assertValid(id);
  const dir = agentDir(agentsDir, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "tmux-session"), name, "utf8");
}

export async function readTmuxSession(
  agentsDir: string,
  id: string,
): Promise<string | null> {
  assertValid(id);
  return readOrNull(join(agentDir(agentsDir, id), "tmux-session"));
}

export async function writeRuntime(
  agentsDir: string,
  id: string,
  runtimeId: string,
): Promise<void> {
  assertValid(id);
  const dir = agentDir(agentsDir, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "runtime"), runtimeId, "utf8");
}

export async function readRuntime(
  agentsDir: string,
  id: string,
): Promise<string | null> {
  assertValid(id);
  return readOrNull(join(agentDir(agentsDir, id), "runtime"));
}

export async function clearManagedSiblings(
  agentsDir: string,
  id: string,
): Promise<void> {
  assertValid(id);
  const dir = agentDir(agentsDir, id);
  for (const name of ["tmux-session", "runtime"]) {
    try {
      await unlink(join(dir, name));
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
}

export async function listManagedAgentIds(agentsDir: string): Promise<string[]> {
  if (!(await exists(agentsDir))) return [];
  const entries = await readdir(agentsDir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (await exists(join(agentsDir, e.name, "tmux-session"))) out.push(e.name);
  }
  return out.sort();
}
