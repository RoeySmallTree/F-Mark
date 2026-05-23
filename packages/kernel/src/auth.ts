import { randomBytes } from "node:crypto";
import {
  appendFile,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { Paths } from "./paths.js";
import { seqLog, LogLevel } from "./lib/seq-log.js";

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
}

export async function deleteTokenFile(p: Paths): Promise<void> {
  try {
    await unlink(p.tokenFile());
  } catch (err) {
    if (!isErrnoCode(err, "ENOENT")) throw err;
  }
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
    const hasHeader = req.headers.authorization !== undefined;
    const queryToken = extractQueryToken(req.url);
    const cookieToken = extractCookieToken(req.headers.cookie);
    void seqLog("auth hook {method} {urlPath}", {
      module: "auth",
      method: req.method,
      urlPath,
      url: req.url,
      authConfigured: token !== null,
      hasAuthHeader: hasHeader,
      hasQueryToken: queryToken !== null,
      hasCookieToken: cookieToken !== null,
    });
    if (req.method === "GET" && urlPath === "/health") return;
    if (token === null) return;
    if (req.headers.authorization === `Bearer ${token}`) {
      void seqLog("auth accepted via header {urlPath}", {
        module: "auth",
        urlPath,
      });
      return;
    }
    if (queryToken === token) {
      reply.header(
        "Set-Cookie",
        `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`,
      );
      void seqLog("auth accepted via query token, cookie set {urlPath}", {
        module: "auth",
        urlPath,
      });
      return;
    }
    if (cookieToken === token) {
      void seqLog("auth accepted via cookie {urlPath}", {
        module: "auth",
        urlPath,
      });
      return;
    }
    void seqLog(
      "auth rejected {urlPath}",
      {
        module: "auth",
        urlPath,
        hasAuthHeader: hasHeader,
        hasQueryToken: queryToken !== null,
        hasCookieToken: cookieToken !== null,
        $note: "returning 401",
      },
      LogLevel.Warning,
    );
    reply.code(401).send({ error: "unauthorized" });
  });
}
