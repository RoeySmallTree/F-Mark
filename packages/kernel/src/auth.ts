import { randomBytes } from "node:crypto";
import {
  appendFile,
  chmod,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { Paths } from "./paths.js";

const GITIGNORE_FILE_NAME = ".gitignore";
const GITIGNORE_ENTRY = ".f-mark/.token";
const SESSION_DIR = ".f-mark";

function isErrnoCode(err: unknown, code: string): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === code
  );
}

export function generateToken(): string {
  return randomBytes(16).toString("hex");
}

export async function writeTokenFile(p: Paths, token: string): Promise<void> {
  await writeFile(p.tokenFile(), token, { mode: 0o600 });
  // `writeFile`'s `mode` only applies when CREATING the file. When we reuse a
  // pre-existing token (stable-token boot) the file may already carry looser
  // perms, so reassert 0600 explicitly to keep the persisted credential tight.
  await chmod(p.tokenFile(), 0o600);
}

export async function ensureProjectAuth(
  p: Paths,
  token: string | null,
): Promise<void> {
  if (token === null) return;
  await mkdir(p.fmarkDir(), { recursive: true });
  await writeTokenFile(p, token);
  await ensureGitignoreEntry(p);
}

export async function deleteTokenFile(p: Paths): Promise<void> {
  try {
    await unlink(p.tokenFile());
  } catch (err) {
    if (!isErrnoCode(err, "ENOENT")) throw err;
  }
}

/**
 * Read the persisted project token from `.f-mark/.token`, or null when the
 * file is absent or empty. Mirrors the MCP/hook reader (mcp/context.ts
 * readOptionalToken) so the kernel and its agents always agree on the token.
 */
export async function readExistingToken(p: Paths): Promise<string | null> {
  try {
    const token = (await readFile(p.tokenFile(), "utf8")).trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export interface ResolvedBootToken {
  /** The auth token for this boot, or null under --no-auth. */
  token: string | null;
  /** True only when this boot generated a brand-new token (no --password and
   *  no pre-existing file). Used to gate bind-failure cleanup so a token that
   *  predates this boot is never clobbered. */
  generated: boolean;
}

/**
 * Decide the kernel's auth token for this boot.
 *
 * Precedence: --no-auth → null; explicit --password → that value; an existing
 * `.f-mark/.token` → reuse it (STABLE across restarts); otherwise generate a
 * fresh one. Reusing the persisted token is what keeps long-lived managed
 * agents working — including ones re-adopted by `reconcile` after a kernel
 * restart: their MCP/hook calls read the same `.token` file the kernel
 * validates against, so restarting the kernel no longer invalidates them
 * (the source of the 401-unauthorized failures). The token file is gitignored
 * and written 0600, so persisting it carries the same posture as --password.
 */
/**
 * Atomically create the token file with a fresh token. The `wx` flag (O_EXCL)
 * means exactly one of several concurrently-booting kernels can win creation;
 * the rest get EEXIST and adopt the winner's token, so the file and every live
 * server converge on a single token (no divergent in-memory tokens → no 401s).
 * Returns the token we created, or null if the file already existed.
 * Requires `.f-mark/` to exist (initProject runs before this at boot).
 */
async function createTokenExclusive(p: Paths): Promise<string | null> {
  const token = generateToken();
  try {
    await writeFile(p.tokenFile(), token, { flag: "wx", mode: 0o600 });
    return token;
  } catch (err) {
    if (isErrnoCode(err, "EEXIST")) return null;
    throw err;
  }
}

export async function resolveBootToken(
  p: Paths,
  options: { noAuth: boolean; password?: string },
): Promise<ResolvedBootToken> {
  if (options.noAuth) return { token: null, generated: false };
  if (options.password !== undefined) {
    return { token: options.password, generated: false };
  }
  const existing = await readExistingToken(p);
  if (existing !== null) return { token: existing, generated: false };
  // No token yet — create one atomically so concurrent cold boots can't each
  // mint a different token and strand one another.
  const created = await createTokenExclusive(p);
  if (created !== null) return { token: created, generated: true };
  // Lost the create race to a concurrent boot; adopt the winner's token.
  const winner = await readExistingToken(p);
  if (winner !== null) return { token: winner, generated: false };
  // Extremely unlikely (created then removed between calls) — fall back.
  return { token: generateToken(), generated: true };
}

export async function ensureGitignoreEntry(p: Paths): Promise<void> {
  const gitignorePath = join(p.root(), GITIGNORE_FILE_NAME);
  let existing = "";
  try {
    existing = await readFile(gitignorePath, "utf8");
  } catch (err) {
    if (!isErrnoCode(err, "ENOENT")) throw err;
  }

  const lines = existing.split("\n").map((l) => l.trim());
  if (
    lines.includes(GITIGNORE_ENTRY) ||
    lines.includes(`${SESSION_DIR}/`) ||
    lines.includes(SESSION_DIR)
  ) {
    return;
  }

  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  await appendFile(gitignorePath, `${prefix}${GITIGNORE_ENTRY}\n`);
}

const COOKIE_NAME = "fmark_token";

function extractQueryToken(url: string): string | null {
  const queryIdx = url.indexOf("?");
  if (queryIdx === -1) return null;
  const params = new URLSearchParams(url.slice(queryIdx + 1));
  return params.get("token");
}

function extractCookieToken(cookieHeader: string | undefined): string | null {
  if (cookieHeader === undefined) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === COOKIE_NAME) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export function registerAuthHook(
  app: FastifyInstance,
  token: string | null,
): void {
  app.addHook("onRequest", async (req, reply) => {
    const queryIdx = req.url.indexOf("?");
    const urlPath = queryIdx === -1 ? req.url : req.url.slice(0, queryIdx);
    const queryToken = extractQueryToken(req.url);
    const cookieToken = extractCookieToken(req.headers.cookie);
    if (req.method === "GET" && urlPath === "/health") return;
    if (token === null) return;
    if (req.headers.authorization === `Bearer ${token}`) {
      return;
    }
    if (queryToken === token) {
      reply.header(
        "Set-Cookie",
        `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`,
      );
      return;
    }
    if (cookieToken === token) {
      return;
    }
    reply.code(401).send({ error: "unauthorized" });
  });
}
