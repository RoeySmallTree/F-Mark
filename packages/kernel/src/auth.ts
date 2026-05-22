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

export function registerAuthHook(
  app: FastifyInstance,
  token: string | null,
): void {
  app.addHook("onRequest", async (req, reply) => {
    const queryIdx = req.url.indexOf("?");
    const urlPath = queryIdx === -1 ? req.url : req.url.slice(0, queryIdx);
    if (req.method === "GET" && urlPath === "/health") return;
    if (token === null) return;
    if (req.headers.authorization !== `Bearer ${token}`) {
      reply.code(401).send({ error: "unauthorized" });
    }
  });
}
