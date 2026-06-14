import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface FilesFavoritesFile {
  paths: string[];
}

const DEFAULT: FilesFavoritesFile = { paths: [] };

/* Per-file mutex map. Each favorites file (project-scoped or session-scoped)
   gets its own serializer so two requests targeting the SAME file are ordered,
   but unrelated files don't block each other. */
const mutexes = new Map<string, Promise<void>>();

async function acquire(key: string): Promise<() => void> {
  let release!: () => void;
  const next = new Promise<void>((res) => {
    release = res;
  });
  const prev = mutexes.get(key) ?? Promise.resolve();
  mutexes.set(key, next);
  await prev;
  return () => {
    release();
    if (mutexes.get(key) === next) mutexes.delete(key);
  };
}

function normalize(input: unknown): FilesFavoritesFile {
  if (input === null || typeof input !== "object") return { ...DEFAULT };
  const paths = (input as { paths?: unknown }).paths;
  if (!Array.isArray(paths)) return { ...DEFAULT };
  return { paths: paths.filter((p): p is string => typeof p === "string") };
}

export async function readFavoritesFile(file: string): Promise<FilesFavoritesFile> {
  try {
    const raw = await readFile(file, "utf8");
    return normalize(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...DEFAULT };
    }
    throw err;
  }
}

async function writeFavoritesFile(
  file: string,
  data: FilesFavoritesFile,
): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, file);
}

export async function updateFavoritesFile(
  file: string,
  mutator: (current: FilesFavoritesFile) => FilesFavoritesFile,
): Promise<FilesFavoritesFile> {
  const release = await acquire(file);
  try {
    const current = await readFavoritesFile(file);
    const next = mutator(current);
    await writeFavoritesFile(file, next);
    return next;
  } finally {
    release();
  }
}
