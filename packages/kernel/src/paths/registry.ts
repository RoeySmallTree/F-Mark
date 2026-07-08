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

  /* Read every registered project's path file in parallel. This list grows
     once per project ever opened (84+ here), and was previously read with a
     sequential await-in-loop on the hot path of every all-roots enumeration. */
  const reads = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const raw = await readFile(g.projectPathFile(entry.name), "utf8");
          const path = raw.trim();
          return path.length > 0 ? path : null;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw err;
        }
      }),
  );
  return reads.filter((path): path is string => path !== null);
}
