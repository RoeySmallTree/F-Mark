import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, join } from "path";

const PARTICIPANT_RE = /^[a-z][a-z0-9-]{0,63}$/;

function assertValidParticipant(id: string): void {
  if (!PARTICIPANT_RE.test(id)) {
    throw new Error(`invalid participant_id: ${id}`);
  }
}

export function activeSessionPath(fmarkDir: string, participantId: string): string {
  assertValidParticipant(participantId);
  return join(fmarkDir, "agents", participantId, "active-session");
}

export async function writeActiveSession(
  fmarkDir: string,
  participantId: string,
  sessionId: string,
): Promise<void> {
  const target = activeSessionPath(fmarkDir, participantId);
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, sessionId, "utf8");
  await rename(tmp, target); // atomic on POSIX
}

export async function readActiveSession(
  fmarkDir: string,
  participantId: string,
): Promise<string | null> {
  try {
    const txt = await readFile(activeSessionPath(fmarkDir, participantId), "utf8");
    return txt.trim() || null;
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}
