import { readdir, realpath, access, constants } from "node:fs/promises";
import { isAbsolute, join, dirname, sep } from "node:path";
import { homedir } from "node:os";
import type { FastifyInstance } from "fastify";

interface FsErrorShape {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

const ENTRIES_CAP = 1000;

const PSEUDO_FS_PREFIXES = ["/proc", "/sys", "/dev"];

function isPseudoFs(absPath: string): boolean {
  for (const prefix of PSEUDO_FS_PREFIXES) {
    if (absPath === prefix) return true;
    if (absPath.startsWith(`${prefix}${sep}`)) return true;
  }
  return false;
}

interface ResolvedPath {
  ok: true;
  canonical: string;
  parent: string | null;
}
interface ResolveError {
  ok: false;
  status: number;
  body: FsErrorShape;
}

export type { ResolvedPath, ResolveError, FsErrorShape };

async function resolveBrowsePath(
  raw: unknown,
): Promise<ResolvedPath | ResolveError> {
  if (typeof raw !== "string" || raw.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { code: "PATH_REQUIRED", message: "path query param is required" },
    };
  }
  if (!isAbsolute(raw)) {
    return {
      ok: false,
      status: 400,
      body: { code: "PATH_NOT_ABSOLUTE", message: "path must be absolute" },
    };
  }
  let canonical: string;
  try {
    canonical = await realpath(raw);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "EUNKNOWN";
    if (code === "ENOENT" || code === "ENOTDIR") {
      return {
        ok: false,
        status: 404,
        body: { code: "PATH_NOT_FOUND", message: `path not found: ${raw}` },
      };
    }
    return {
      ok: false,
      status: 400,
      body: {
        code: "PATH_NOT_CANONICAL",
        message: `could not canonicalize: ${raw}`,
        details: { errno: code },
      },
    };
  }
  if (isPseudoFs(canonical)) {
    return {
      ok: false,
      status: 403,
      body: {
        code: "FS_DENIED",
        message: "pseudo-filesystem paths are not browseable",
        details: { path: canonical },
      },
    };
  }
  try {
    await access(canonical, constants.R_OK);
  } catch {
    return {
      ok: false,
      status: 403,
      body: {
        code: "FS_DENIED",
        message: "directory is not readable",
        details: { path: canonical },
      },
    };
  }
  const parent = dirname(canonical);
  return { ok: true, canonical, parent: parent === canonical ? null : parent };
}

export function registerFsRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { path?: string } }>("/fs/list", async (req, reply) => {
    const resolved = await resolveBrowsePath(req.query.path);
    if (!resolved.ok) return reply.code(resolved.status).send(resolved.body);

    let dirents;
    try {
      dirents = await readdir(resolved.canonical, { withFileTypes: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "EUNKNOWN";
      if (code === "ENOTDIR") {
        return reply.code(400).send({
          code: "PATH_NOT_DIRECTORY",
          message: `path is not a directory: ${resolved.canonical}`,
        });
      }
      throw err;
    }
    /* Directories only — the picker is choosing a folder, not a file. */
    const dirs = dirents
      .filter((d) => d.isDirectory())
      .map((d) => ({ name: d.name, isDir: true as const }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const truncated = dirs.length > ENTRIES_CAP;
    const entries = truncated ? dirs.slice(0, ENTRIES_CAP) : dirs;

    return {
      path: resolved.canonical,
      parent: resolved.parent,
      entries,
      truncated,
    };
  });

  app.get("/fs/home", async () => {
    const home = homedir();
    return { home, xdgConfigHome: process.env.XDG_CONFIG_HOME ?? null };
  });
}

/* Exposed for kernel-internal callers (sessions route) that need the same
   validation contract. Returns the canonical absolute path or a structured
   error the caller can forward to its reply. */
export async function validateWritableDirectory(
  raw: unknown,
): Promise<{ ok: true; canonical: string } | ResolveError> {
  if (typeof raw !== "string" || raw.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { code: "PATH_REQUIRED", message: "path is required" },
    };
  }
  if (!isAbsolute(raw)) {
    return {
      ok: false,
      status: 400,
      body: { code: "PATH_NOT_ABSOLUTE", message: "path must be absolute" },
    };
  }
  let canonical: string;
  try {
    canonical = await realpath(raw);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "EUNKNOWN";
    if (code === "ENOENT" || code === "ENOTDIR") {
      return {
        ok: false,
        status: 400,
        body: { code: "PATH_NOT_FOUND", message: `path not found: ${raw}` },
      };
    }
    return {
      ok: false,
      status: 400,
      body: {
        code: "PATH_NOT_CANONICAL",
        message: `could not canonicalize: ${raw}`,
        details: { errno: code },
      },
    };
  }
  try {
    await access(canonical, constants.W_OK);
  } catch {
    return {
      ok: false,
      status: 403,
      body: {
        code: "PATH_NOT_WRITABLE",
        message: `path not writable: ${canonical}`,
      },
    };
  }
  return { ok: true, canonical };
}

/* Re-export for tests. */
export { join as joinPath };
