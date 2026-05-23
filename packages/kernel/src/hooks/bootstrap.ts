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
}

export async function loadHookContext(cwd: string): Promise<HookContext> {
  const fmarkDir = await findFmarkDir(cwd);
  if (!fmarkDir) throw new Error(`no .f-mark/ found above ${cwd}`);
  const token = (await readFile(join(fmarkDir, ".token"), "utf8")).trim();
  const cfg = JSON.parse(
    await readFile(join(fmarkDir, "config.json"), "utf8"),
  ) as { port?: number; host?: string };
  const port = cfg.port ?? 7777;
  const host = cfg.host ?? "localhost";
  return { fmarkDir, kernelUrl: `http://${host}:${port}`, token };
}
