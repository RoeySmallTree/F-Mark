import { mkdir, readdir, stat } from "node:fs/promises";
import type { Paths } from "./paths.js";

export interface SessionMeta {
  id: string;
  slug: string;
  created_at: string;
}

export interface CreateSessionInput {
  slug?: string;
}

const DEFAULT_SLUG = "untitled";
const SLUG_PATTERN = /^[a-z0-9-]+$/;

function todayUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeSlug(raw: string): string {
  if (raw.includes("..") || raw.includes("/") || raw.includes("\\")) {
    throw new Error(`slug must not contain path separators or '..': ${raw}`);
  }
  const slug = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  if (slug.length === 0) throw new Error("slug is empty after normalisation");
  if (!SLUG_PATTERN.test(slug)) throw new Error(`invalid slug: ${raw}`);
  return slug;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

export async function createSession(
  p: Paths,
  input: CreateSessionInput,
): Promise<SessionMeta> {
  await mkdir(p.sessionsDir(), { recursive: true });
  const slug = normalizeSlug(input.slug ?? DEFAULT_SLUG);
  const date = todayUtc();
  const base = `${date}-${slug}`;
  let id = base;
  let suffix = 2;
  while (await exists(p.sessionDir(id))) {
    id = `${base}-${suffix++}`;
  }
  await mkdir(p.sessionDir(id), { recursive: true });
  const s = await stat(p.sessionDir(id));
  return { id, slug, created_at: s.birthtime.toISOString() };
}

export async function listSessions(p: Paths): Promise<SessionMeta[]> {
  await mkdir(p.sessionsDir(), { recursive: true });
  const entries = await readdir(p.sessionsDir(), { withFileTypes: true });
  const sessions: SessionMeta[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const id = e.name;
    const slug = id.replace(/^\d{4}-\d{2}-\d{2}-/, "");
    const s = await stat(p.sessionDir(id));
    sessions.push({ id, slug, created_at: s.birthtime.toISOString() });
  }
  sessions.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sessions;
}

export async function sessionExists(p: Paths, id: string): Promise<boolean> {
  if (!/^[a-z0-9-]+$/.test(id)) return false;
  return exists(p.sessionDir(id));
}
