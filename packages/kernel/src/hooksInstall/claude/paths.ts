import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type ClaudeHookScope = "local" | "global";

export interface ClaudeConfigSpec {
  scope: ClaudeHookScope;
  configPath: string;
}

export function claudeConfigPath(
  scope: ClaudeHookScope = "global",
  projectRoot?: string,
): string {
  if (scope === "local") {
    if (!projectRoot) throw new Error("projectRoot required for local Claude settings");
    return join(projectRoot, ".claude", "settings.json");
  }
  return join(homedir(), ".claude", "settings.json");
}

export async function resolveClaudeConfigPath(
  scope: ClaudeHookScope,
  projectRoot?: string,
): Promise<string> {
  if (scope === "global") return claudeConfigPath("global");
  if (!projectRoot) throw new Error("projectRoot required for local Claude settings");
  return closestLocalClaudeConfigPath(projectRoot);
}

export async function resolveClaudeConfigSpecs(
  projectRoot?: string,
): Promise<ClaudeConfigSpec[]> {
  const specs: ClaudeConfigSpec[] = [];
  if (projectRoot) {
    specs.push({
      scope: "local",
      configPath: await resolveClaudeConfigPath("local", projectRoot),
    });
  }
  specs.push({ scope: "global", configPath: claudeConfigPath("global") });
  return specs;
}

async function closestLocalClaudeConfigPath(projectRoot: string): Promise<string> {
  for (const dir of localCandidateDirs(projectRoot, homedir())) {
    const candidate = join(dir, ".claude", "settings.json");
    if (await existsOrIsBlocked(candidate)) return candidate;
  }
  return claudeConfigPath("local", projectRoot);
}

function* localCandidateDirs(projectRoot: string, home: string): Generator<string> {
  let dir = projectRoot;
  for (;;) {
    if (dir === home && projectRoot !== home) return;
    yield dir;
    if (dir === home) return;

    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

async function existsOrIsBlocked(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    return !isMissingPathError(err);
  }
}

function isMissingPathError(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
