import { join } from "node:path";
import { computePathId } from "./identity.js";

export interface ActivePaths {
  root(): string;
  pathId(): string;
  fmarkDir(): string;
  sessionsDir(): string;
  sessionDir(id: string): string;
  participantsFile(): string;
  agentMd(): string;
}

export function activePaths(root: string): ActivePaths {
  const id = computePathId(root);
  const fmark = join(root, ".f-mark");
  return {
    root: () => root,
    pathId: () => id,
    fmarkDir: () => fmark,
    sessionsDir: () => join(fmark, "sessions"),
    sessionDir: (sessionId: string) => join(fmark, "sessions", sessionId),
    participantsFile: () => join(fmark, "participants.json"),
    agentMd: () => join(fmark, "AGENT.md"),
  };
}
