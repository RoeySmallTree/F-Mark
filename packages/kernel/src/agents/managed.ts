import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PARTICIPANT_RE = /^[a-z][a-z0-9-]{0,63}$/;

function assertValid(id: string): void {
  if (!PARTICIPANT_RE.test(id)) {
    throw new Error(`invalid participant_id: ${id}`);
  }
}

function agentDir(fmarkDir: string, id: string): string {
  return join(fmarkDir, "agents", id);
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

export async function writeTmuxSession(
  fmarkDir: string,
  id: string,
  name: string,
): Promise<void> {
  assertValid(id);
  const dir = agentDir(fmarkDir, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "tmux-session"), name, "utf8");
}

export async function readTmuxSession(
  fmarkDir: string,
  id: string,
): Promise<string | null> {
  assertValid(id);
  return readOrNull(join(agentDir(fmarkDir, id), "tmux-session"));
}

export async function writeRuntime(
  fmarkDir: string,
  id: string,
  runtimeId: string,
): Promise<void> {
  assertValid(id);
  const dir = agentDir(fmarkDir, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "runtime"), runtimeId, "utf8");
}

export async function readRuntime(
  fmarkDir: string,
  id: string,
): Promise<string | null> {
  assertValid(id);
  return readOrNull(join(agentDir(fmarkDir, id), "runtime"));
}

export async function clearManagedSiblings(
  fmarkDir: string,
  id: string,
): Promise<void> {
  assertValid(id);
  const dir = agentDir(fmarkDir, id);
  for (const name of ["tmux-session", "runtime"]) {
    try {
      await unlink(join(dir, name));
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
}

export async function listManagedAgentIds(fmarkDir: string): Promise<string[]> {
  const root = join(fmarkDir, "agents");
  if (!(await exists(root))) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (await exists(join(root, e.name, "tmux-session"))) out.push(e.name);
  }
  return out.sort();
}
