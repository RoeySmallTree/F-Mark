import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import { dirname, join } from "path";

const PARTICIPANT_RE = /^[a-z][a-z0-9-]{0,63}$/;

function assertValidParticipant(id: string): void {
  if (!PARTICIPANT_RE.test(id)) {
    throw new Error(`invalid participant_id: ${id}`);
  }
}

/* `agentsDir` is the directory containing per-agent subdirs. v0.4:
   `<root>/.f-mark/agents`. v0.5: `~/.config/f-mark/projects/<pathId>/agents`. */
export function activeSessionPath(agentsDir: string, participantId: string): string {
  assertValidParticipant(participantId);
  return join(agentsDir, participantId, "active-session");
}

export async function writeActiveSession(
  agentsDir: string,
  participantId: string,
  sessionId: string,
): Promise<void> {
  const target = activeSessionPath(agentsDir, participantId);
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, sessionId, "utf8");
  await rename(tmp, target); // atomic on POSIX
}

export async function readActiveSession(
  agentsDir: string,
  participantId: string,
): Promise<string | null> {
  try {
    const txt = await readFile(activeSessionPath(agentsDir, participantId), "utf8");
    return txt.trim() || null;
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function clearActiveSession(
  agentsDir: string,
  participantId: string,
): Promise<void> {
  try {
    await unlink(activeSessionPath(agentsDir, participantId));
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
  }
}
