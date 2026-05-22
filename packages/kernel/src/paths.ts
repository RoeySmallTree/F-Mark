import { join } from "node:path";

export interface Paths {
  root(): string;
  fmarkDir(): string;
  configFile(): string;
  tokenFile(): string;
  agentMd(): string;
  sessionsDir(): string;
  sessionDir(id: string): string;
}

const FMARK = ".f-mark";

export function paths(root: string): Paths {
  return {
    root: () => root,
    fmarkDir: () => join(root, FMARK),
    configFile: () => join(root, FMARK, "config.json"),
    tokenFile: () => join(root, FMARK, ".token"),
    agentMd: () => join(root, FMARK, "AGENT.md"),
    sessionsDir: () => join(root, FMARK, "sessions"),
    sessionDir: (id: string) => join(root, FMARK, "sessions", id),
  };
}
