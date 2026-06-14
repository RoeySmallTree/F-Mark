import { cp, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Paths } from "./paths.js";

export interface SessionMeta {
  id: string;
  slug: string;
  created_at: string;
}

export interface CreateSessionInput {
  slug?: string;
}

export interface ForkMetadata {
  schema: "fmark.session-fork.v1";
  source_session_id: string;
  source_path: string;
  forked_at: string;
  requested_name: string;
  copied_head?: string;
  agent_participant_ids: string[];
}

export interface ForkSessionInput {
  sourceSessionId: string;
  name?: string;
  agentParticipantIds?: string[];
}

export interface ForkSessionResult {
  session: SessionMeta;
  copied_entries: number;
  metadata: ForkMetadata;
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

async function allocateSessionId(p: Paths, slug: string): Promise<string> {
  await mkdir(p.sessionsDir(), { recursive: true });
  const date = todayUtc();
  const base = `${date}-${slug}`;
  let id = base;
  let suffix = 2;
  while (await exists(p.sessionDir(id))) {
    id = `${base}-${suffix++}`;
  }
  return id;
}

export async function createSession(
  p: Paths,
  input: CreateSessionInput,
): Promise<SessionMeta> {
  const slug = normalizeSlug(input.slug ?? DEFAULT_SLUG);
  const id = await allocateSessionId(p, slug);
  await mkdir(p.sessionDir(id), { recursive: true });
  const s = await stat(p.sessionDir(id));
  return { id, slug, created_at: s.birthtime.toISOString() };
}

const FORK_LINK_FILENAME_RE = /\.fork-link\.json$/;

/** Items excluded from a fork copy. Fork-link event files carry
 *  session-pair pointers; copying them would propagate one fork's marker
 *  into descendants (fork-of-fork inheriting ancestral links, or
 *  second-fork-from-same-source inheriting the first fork's "to" marker). */
function isExcludedFromForkCopy(entryName: string): boolean {
  return FORK_LINK_FILENAME_RE.test(entryName);
}

async function countEntries(
  path: string,
  filter?: (name: string) => boolean,
): Promise<number> {
  let count = 0;
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    if (filter !== undefined && filter(entry.name)) continue;
    count++;
    if (entry.isDirectory()) {
      count += await countEntries(join(path, entry.name), filter);
    }
  }
  return count;
}

async function copiedHead(path: string): Promise<string | undefined> {
  const entries = (await readdir(path, { withFileTypes: true }))
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
  return entries.at(-1);
}

export async function forkSessionFolder(
  p: Paths,
  input: ForkSessionInput,
): Promise<ForkSessionResult> {
  if (!(await sessionExists(p, input.sourceSessionId))) {
    throw new Error(`session not found: ${input.sourceSessionId}`);
  }
  const sourceDir = p.sessionDir(input.sourceSessionId);
  const sourceSlug = input.sourceSessionId.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const slug = normalizeSlug(input.name ?? `${sourceSlug}-fork`);
  const id = await allocateSessionId(p, slug);
  const targetDir = p.sessionDir(id);
  const tempDir = join(
    p.sessionsDir(),
    `.fork-${id}-${process.pid}-${Date.now()}.tmp`,
  );
  const copied_entries = await countEntries(
    sourceDir,
    (name) => isExcludedFromForkCopy(name),
  );
  const forked_at = new Date().toISOString();
  const head = await copiedHead(sourceDir);
  const metadata: ForkMetadata = {
    schema: "fmark.session-fork.v1",
    source_session_id: input.sourceSessionId,
    source_path: p.root(),
    forked_at,
    requested_name: slug,
    ...(head !== undefined ? { copied_head: head } : {}),
    agent_participant_ids: input.agentParticipantIds ?? [],
  };

  await rm(tempDir, { recursive: true, force: true });
  try {
    await cp(sourceDir, tempDir, {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
      filter: (src) => {
        const base = src.split("/").pop() ?? src;
        return !isExcludedFromForkCopy(base);
      },
    });
    await writeFile(
      join(tempDir, ".fork.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    );
    await rename(tempDir, targetDir);
  } catch (err) {
    await rm(tempDir, { recursive: true, force: true });
    throw err;
  }

  const s = await stat(targetDir);
  return {
    session: { id, slug, created_at: s.birthtime.toISOString() },
    copied_entries,
    metadata,
  };
}

export async function listSessions(p: Paths): Promise<SessionMeta[]> {
  let entries;
  try {
    entries = await readdir(p.sessionsDir(), { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const sessions: SessionMeta[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".")) continue;
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

export async function renameSession(
  p: Paths,
  id: string,
  input: { slug: string },
): Promise<SessionMeta> {
  if (!(await sessionExists(p, id))) {
    throw new Error(`session not found: ${id}`);
  }
  const slug = normalizeSlug(input.slug);
  const date = /^\d{4}-\d{2}-\d{2}/.exec(id)?.[0] ?? todayUtc();
  const nextId = `${date}-${slug}`;
  if (nextId === id) {
    const s = await stat(p.sessionDir(id));
    return { id, slug, created_at: s.birthtime.toISOString() };
  }
  if (await exists(p.sessionDir(nextId))) {
    throw new Error(`session already exists: ${nextId}`);
  }
  await rename(p.sessionDir(id), p.sessionDir(nextId));
  const s = await stat(p.sessionDir(nextId));
  return { id: nextId, slug, created_at: s.birthtime.toISOString() };
}

export async function deleteSession(p: Paths, id: string): Promise<void> {
  if (!(await sessionExists(p, id))) {
    throw new Error(`session not found: ${id}`);
  }
  await rm(p.sessionDir(id), { recursive: true, force: false });
}
