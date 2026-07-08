import { readdir, lstat, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { FastifyInstance } from "fastify";
import ignore, { type Ignore } from "ignore";
import { normaliseDeps, type PathDeps } from "./pathDeps.js";
import { resolveKnownRootScope } from "./rootScope.js";
import type { Paths } from "../paths.js";

export interface FilesTreeEntry {
  index: number;
  parent: number | null;
  name: string;
  relPath: string;
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

export const FILE_TREE_FORCE_IGNORE = new Set([
  ".git",
  ".f-mark",
  "node_modules",
  ".next",
  ".turbo",
  ".cache",
  "out",
  "coverage",
  ".nuxt",
  ".svelte-kit",
  ".parcel-cache",
]);

function lowerExt(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

interface IgnoreRule {
  baseRelDir: string;
  ignore: Ignore;
}

async function loadGitignore(absDir: string): Promise<Ignore | null> {
  const ig = ignore();
  try {
    const raw = await readFile(join(absDir, ".gitignore"), "utf8");
    ig.add(raw);
    return ig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return null;
  }
}

function relPathFromRuleBase(
  relPathPosix: string,
  baseRelDir: string,
): string | null {
  if (baseRelDir.length === 0) return relPathPosix;
  const prefix = `${baseRelDir}/`;
  if (!relPathPosix.startsWith(prefix)) return null;
  return relPathPosix.slice(prefix.length);
}

function isIgnored(
  rules: IgnoreRule[],
  relPathPosix: string,
  isDir: boolean,
): boolean {
  const segments = relPathPosix.split("/");
  if (segments.some((s) => FILE_TREE_FORCE_IGNORE.has(s))) return true;
  /* `ignore` expects directory paths to end with `/` so dir-only rules
     (`build/`) match the dir itself, not just its children. */
  let ignored = false;
  for (const rule of rules) {
    const relToBase = relPathFromRuleBase(relPathPosix, rule.baseRelDir);
    if (relToBase === null || relToBase.length === 0) continue;
    const candidate = isDir ? `${relToBase}/` : relToBase;
    const result = rule.ignore.test(candidate);
    if (result.ignored) ignored = true;
    else if (result.unignored) ignored = false;
  }
  return ignored;
}

interface QueueItem {
  absPath: string;
  relPath: string;
  parentIndex: number | null;
  depth: number;
  ignoreRules: IgnoreRule[];
}

export function registerFilesTreeRoute(
  app: FastifyInstance,
  depsArg: Paths | PathDeps,
): void {
  const deps = normaliseDeps(depsArg);

  app.get<{ Querystring: { path_id?: string; root?: string } }>(
    "/files/tree",
    async (req, reply) => {
      /* Require a known root scope — no arbitrary filesystem browsing (X4b
         / X7 security landmine). The `root` query is validated against the
         known-root set, not passed straight to resolveBrowsePath. */
      const scope = await resolveKnownRootScope(deps, {
        path_id: req.query.path_id,
        root: req.query.root,
      });
      if (!scope.ok) return reply.code(scope.status).send(scope.body);

      const root = scope.known.root;
      try {
        const rootStat = await stat(root);
        if (!rootStat.isDirectory()) {
          return reply.code(400).send({
            code: "PATH_NOT_DIRECTORY",
            message: `path is not a directory: ${root}`,
          });
        }
      } catch (err) {
        return reply.code(500).send({
          code: "STAT_FAILED",
          message: (err as Error).message,
        });
      }

      const entries: FilesTreeEntry[] = [];
      const queue: QueueItem[] = [
        {
          absPath: root,
          relPath: "",
          parentIndex: null,
          depth: -1,
          ignoreRules: [],
        },
      ];
      let truncated = false;
      let truncatedAt = 0;

      while (queue.length > 0) {
        const dir = queue.shift()!;
        const dirGitignore = await loadGitignore(dir.absPath);
        const ignoreRules =
          dirGitignore === null
            ? dir.ignoreRules
            : [
                ...dir.ignoreRules,
                { baseRelDir: dir.relPath, ignore: dirGitignore },
              ];
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
          const ignored = isIgnored(ignoreRules, relPosix, isDir);

          const index = entries.length;
          entries.push({
            index,
            parent: dir.parentIndex,
            name: dirent.name,
            relPath: relPosix,
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
              relPath: relPosix,
              parentIndex: index,
              depth: dir.depth + 1,
              ignoreRules,
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
