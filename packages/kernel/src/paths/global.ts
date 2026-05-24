import { homedir } from "node:os";
import { join } from "node:path";

export interface GlobalPaths {
  configDir(): string;
  tokenFile(): string;
  stateFile(): string;
  configFile(): string;
  defaultRuntimesFile(): string;
  projectsDir(): string;
  projectDir(pathId: string): string;
  projectPathFile(pathId: string): string;
  projectRuntimesFile(pathId: string): string;
  projectAgentsDir(pathId: string): string;
  projectAgentDir(pathId: string, agentId: string): string;
}

/* Resolve the config root. Honors $XDG_CONFIG_HOME (per XDG Base Directory
   Spec). Falls back to ~/.config when XDG is unset. The literal `f-mark`
   subdir is appended in both cases. */
export function resolveConfigRoot(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config");
  return join(base, "f-mark");
}

export function globalPaths(configRoot: string = resolveConfigRoot()): GlobalPaths {
  return {
    configDir: () => configRoot,
    tokenFile: () => join(configRoot, ".token"),
    stateFile: () => join(configRoot, "state.json"),
    configFile: () => join(configRoot, "config.json"),
    defaultRuntimesFile: () => join(configRoot, "runtimes.json"),
    projectsDir: () => join(configRoot, "projects"),
    projectDir: (pathId: string) => join(configRoot, "projects", pathId),
    projectPathFile: (pathId: string) => join(configRoot, "projects", pathId, "path"),
    projectRuntimesFile: (pathId: string) =>
      join(configRoot, "projects", pathId, "runtimes.json"),
    projectAgentsDir: (pathId: string) => join(configRoot, "projects", pathId, "agents"),
    projectAgentDir: (pathId: string, agentId: string) =>
      join(configRoot, "projects", pathId, "agents", agentId),
  };
}
