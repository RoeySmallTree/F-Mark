import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";

function hasPathSeparator(value: string): boolean {
  return value.includes("/") || value.includes("\\");
}

function addDir(seen: Set<string>, dirs: string[], dir: string | undefined): void {
  if (dir === undefined || dir.length === 0) return;
  if (seen.has(dir)) return;
  seen.add(dir);
  dirs.push(dir);
}

function executableSearchDirs(env: NodeJS.ProcessEnv): string[] {
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    addDir(seen, dirs, dir);
  }
  const home = env.HOME;
  if (home !== undefined && home.length > 0) {
    addDir(seen, dirs, join(home, ".local", "bin"));
    addDir(seen, dirs, join(home, ".local", "share", "mise", "shims"));
    addDir(
      seen,
      dirs,
      join(home, ".local", "share", "mise", "installs", "node", "lts", "bin"),
    );
    addDir(seen, dirs, join(home, ".bun", "bin"));
    addDir(seen, dirs, join(home, ".npm-global", "bin"));
  }
  return dirs;
}

export function envWithExecutableSearchPath(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const dirs = executableSearchDirs(env);
  return { ...env, PATH: dirs.join(delimiter) };
}

function executableCandidates(
  executable: string,
  env: NodeJS.ProcessEnv,
): string[] {
  if (hasPathSeparator(executable)) return [executable];
  return executableSearchDirs(env).map((dir) => join(dir, executable));
}

export async function executableExistsOnDisk(
  executable: string,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  for (const candidate of executableCandidates(executable, env)) {
    try {
      await access(candidate, constants.X_OK);
      return true;
    } catch {
      // Try the next candidate.
    }
  }
  return false;
}

export async function resolveExecutableForExec(
  executable: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  if (hasPathSeparator(executable)) return executable;
  for (const candidate of executableCandidates(executable, env)) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return executable;
}
