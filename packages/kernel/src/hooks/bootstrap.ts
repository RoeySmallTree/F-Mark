import { readFile, stat } from "fs/promises";
import { dirname, join } from "path";

export async function findFmarkDir(startCwd: string): Promise<string | null> {
  let cur = startCwd;
  while (true) {
    const candidate = join(cur, ".f-mark");
    try {
      const s = await stat(candidate);
      if (s.isDirectory()) return candidate;
    } catch {
      /* keep walking up */
    }
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

export interface HookContext {
  fmarkDir: string;
  kernelUrl: string;
  token: string;
  /* Absolute path to the project the hook is tagged to. Comes from the
     F_MARK_PATH env var (set by tmux manager.spawnAgent in v0.5) or
     defaults to dirname(fmarkDir) when only the upward walk found
     something. Included in event POST bodies so the kernel can return
     409 STALE_PATH when the hook fires against a backgrounded path. */
  path: string;
}

export async function loadHookContext(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HookContext> {
  // Prefer F_MARK_PATH (set by tmux spawn) so hooks bound to a tmux pane
  // always identify their original project, even if the kernel's active
  // path has since moved on.
  const envPath = env.F_MARK_PATH;
  let projectRoot: string | null = null;
  let fmarkDir: string | null = null;

  if (typeof envPath === "string" && envPath.length > 0) {
    projectRoot = envPath;
    fmarkDir = join(envPath, ".f-mark");
    try {
      await stat(fmarkDir);
    } catch {
      // F_MARK_PATH was set but no .f-mark/ yet — fall through to upward walk.
      fmarkDir = null;
      projectRoot = null;
    }
  }

  if (!fmarkDir) {
    fmarkDir = await findFmarkDir(cwd);
    if (!fmarkDir) throw new Error(`no .f-mark/ found above ${cwd}`);
    projectRoot = dirname(fmarkDir);
  }

  const token = (await readFile(join(fmarkDir, ".token"), "utf8")).trim();
  const cfg = JSON.parse(
    await readFile(join(fmarkDir, "config.json"), "utf8"),
  ) as { port?: number; host?: string };
  const port = cfg.port ?? 7777;
  const host = cfg.host ?? "localhost";
  return {
    fmarkDir,
    kernelUrl: `http://${host}:${port}`,
    token,
    path: projectRoot!,
  };
}
