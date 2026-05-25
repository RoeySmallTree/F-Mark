import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { GlobalPaths } from "./global.js";
import { computePathId } from "./identity.js";

export async function registerProjectPath(
  g: GlobalPaths,
  root: string,
): Promise<void> {
  const pathId = computePathId(root);
  const target = g.projectPathFile(pathId);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, root, "utf8");
}

export async function listRegisteredProjectPaths(
  g: GlobalPaths,
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(g.projectsDir(), { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const out: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await readFile(g.projectPathFile(entry.name), "utf8");
      const path = raw.trim();
      if (path.length > 0) out.push(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
  }
  return out;
}
