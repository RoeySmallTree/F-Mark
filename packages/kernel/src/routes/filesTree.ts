import { readdir, lstat, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { FastifyInstance } from "fastify";
import ignore, { type Ignore } from "ignore";
import { resolveBrowsePath } from "./fs.js";

export interface FilesTreeEntry {
  index: number;
  parent: number | null;
  name: string;
  relPath: string;
  absPath: string;
  isDir: boolean;
  isSymlink: boolean;
  ext: string | null;
  size: number | null;
  mtimeMs: number;
  ignored: boolean;
  depth: number;
}

export interface FilesTreeResponse {
  root: string;
  entries: FilesTreeEntry[];
  truncated: boolean;
  truncatedAt: number;
}

const MAX_ENTRIES = 25_000;

export const FILE_TREE_FORCE_IGNORE = new Set([".git", ".f-mark", "node_modules"]);

function lowerExt(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

async function loadRootGitignore(root: string): Promise<Ignore> {
  const ig = ignore();
  try {
    const raw = await readFile(join(root, ".gitignore"), "utf8");
    ig.add(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return ig;
}

function isIgnored(ig: Ignore, relPathPosix: string, isDir: boolean): boolean {
  const segments = relPathPosix.split("/");
  if (segments.some((s) => FILE_TREE_FORCE_IGNORE.has(s))) return true;
  /* `ignore` expects directory paths to end with `/` so dir-only rules
     (`build/`) match the dir itself, not just its children. */
  const candidate = isDir ? `${relPathPosix}/` : relPathPosix;
  return ig.ignores(candidate);
}

interface QueueItem {
  absPath: string;
  parentIndex: number | null;
  depth: number;
}

export function registerFilesTreeRoute(app: FastifyInstance): void {
  app.get<{ Querystring: { root?: string } }>(
    "/files/tree",
    async (req, reply) => {
      const resolved = await resolveBrowsePath(req.query.root);
      if (!resolved.ok) return reply.code(resolved.status).send(resolved.body);

      try {
        const rootStat = await stat(resolved.canonical);
        if (!rootStat.isDirectory()) {
          return reply.code(400).send({
            code: "PATH_NOT_DIRECTORY",
            message: `path is not a directory: ${resolved.canonical}`,
          });
        }
      } catch (err) {
        return reply.code(500).send({
          code: "STAT_FAILED",
          message: (err as Error).message,
        });
      }

      const root = resolved.canonical;
      const ig = await loadRootGitignore(root);
      const entries: FilesTreeEntry[] = [];
      const queue: QueueItem[] = [
        { absPath: root, parentIndex: null, depth: -1 },
      ];
      let truncated = false;
      let truncatedAt = 0;

      while (queue.length > 0) {
        const dir = queue.shift()!;
        let dirents;
        try {
          dirents = await readdir(dir.absPath, { withFileTypes: true });
        } catch {
          continue;
        }
        dirents.sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) {
            return a.isDirectory() ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        for (const dirent of dirents) {
          if (entries.length >= MAX_ENTRIES) {
            truncated = true;
            truncatedAt = entries.length;
            queue.length = 0;
            break;
          }
          const abs = join(dir.absPath, dirent.name);
          const relPosix = relative(root, abs).split(sep).join("/");

          let info;
          try {
            info = await lstat(abs);
          } catch {
            continue;
          }

          const isSymlink = info.isSymbolicLink();
          const isDir = isSymlink ? false : info.isDirectory();
          const ignored = isIgnored(ig, relPosix, isDir);

          const index = entries.length;
          entries.push({
            index,
            parent: dir.parentIndex,
            name: dirent.name,
            relPath: relPosix,
            absPath: abs,
            isDir,
            isSymlink,
            ext: isDir ? null : lowerExt(dirent.name),
            size: isDir ? null : info.size,
            mtimeMs: info.mtimeMs,
            ignored,
            depth: dir.depth + 1,
          });

          /* Skip recursion into ignored directories. They still appear in
             the tree as dimmed entries, but walking their contents (e.g.
             node_modules) would trivially blow past MAX_ENTRIES and isn't
             useful — the user opted to dim ignored entries, not browse
             into them. */
          if (isDir && !isSymlink && !ignored) {
            queue.push({
              absPath: abs,
              parentIndex: index,
              depth: dir.depth + 1,
            });
          }
        }
      }

      const body: FilesTreeResponse = {
        root,
        entries,
        truncated,
        truncatedAt,
      };
      return body;
    },
  );
}
