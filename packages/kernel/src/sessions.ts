import { randomBytes } from "node:crypto";
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PLACEHOLDER_SESSION_SLUG } from "@f-mark/shared";
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

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export {
  isPlaceholderSessionId,
  isPlaceholderSessionSlug,
  PLACEHOLDER_SESSION_SLUG,
} from "@f-mark/shared";

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

/* The session id is IMMUTABLE once minted: it is the storage key everything
   else holds (agent env pins, pollers, cursors, clients). A slug given at
   creation seeds a readable id; placeholder sessions get a random suffix so
   the id carries no name to outgrow. Renames only ever touch the meta slug. */
async function allocateSessionId(p: Paths, slug: string): Promise<string> {
  await mkdir(p.sessionsDir(), { recursive: true });
  const date = todayUtc();
  const seed =
    slug === PLACEHOLDER_SESSION_SLUG
      ? randomBytes(3).toString("hex")
      : slug;
  const base = `${date}-${seed}`;
  let id = base;
  let suffix = 2;
  while (await exists(p.sessionDir(id))) {
    id =
      slug === PLACEHOLDER_SESSION_SLUG
        ? `${date}-${randomBytes(3).toString("hex")}`
        : `${base}-${suffix++}`;
  }
  return id;
}

const SESSION_META_FILENAME = ".meta.json";

interface SessionMetaFile {
  schema: "fmark.session-meta.v1";
  slug: string;
}

async function writeSessionSlug(
  p: Paths,
  id: string,
  slug: string,
): Promise<void> {
  const meta: SessionMetaFile = { schema: "fmark.session-meta.v1", slug };
  await writeFile(
    join(p.sessionDir(id), SESSION_META_FILENAME),
    `${JSON.stringify(meta, null, 2)}\n`,
    "utf8",
  );
}

/** The session's display slug: meta file when present, otherwise derived
 *  from the id (legacy sessions created before the meta file existed). */
export async function readSessionSlug(p: Paths, id: string): Promise<string> {
  try {
    const raw = await readFile(
      join(p.sessionDir(id), SESSION_META_FILENAME),
      "utf8",
    );
    const parsed = JSON.parse(raw) as Partial<SessionMetaFile>;
    if (typeof parsed.slug === "string" && parsed.slug.length > 0) {
      return parsed.slug;
    }
  } catch {
    // Fall through to the id-derived legacy slug.
  }
  return id.replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

export async function createSession(
  p: Paths,
  input: CreateSessionInput,
): Promise<SessionMeta> {
  const slug = normalizeSlug(input.slug ?? PLACEHOLDER_SESSION_SLUG);
  const id = await allocateSessionId(p, slug);
  await mkdir(p.sessionDir(id), { recursive: true });
  await writeSessionSlug(p, id, slug);
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
  await writeSessionSlug(p, id, slug);

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
  const dirs = entries.filter(
    (e) => e.isDirectory() && !e.name.startsWith("."),
  );
  /* stat() every session dir in parallel — this runs per known root, so the
     old sequential await-in-loop multiplied across ~100 roots on a scoped
     all-sessions listing. */
  const sessions = await Promise.all(
    dirs.map(async (e) => {
      const id = e.name;
      const [slug, s] = await Promise.all([
        readSessionSlug(p, id),
        stat(p.sessionDir(id)),
      ]);
      return { id, slug, created_at: s.birthtime.toISOString() };
    }),
  );
  sessions.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sessions;
}

export async function sessionExists(p: Paths, id: string): Promise<boolean> {
  if (!/^[a-z0-9-]+$/.test(id)) return false;
  return exists(p.sessionDir(id));
}

/* Renaming touches ONLY the display slug in the session's meta file. The id
   (and therefore the directory, event storage, agent env pins, pollers,
   cursors, and every client's current-session pointer) never changes — the
   whole class of rename races is unrepresentable by construction. */
export async function renameSession(
  p: Paths,
  id: string,
  input: { slug: string },
): Promise<SessionMeta> {
  if (!(await sessionExists(p, id))) {
    throw new Error(`session not found: ${id}`);
  }
  const slug = normalizeSlug(input.slug);
  await writeSessionSlug(p, id, slug);
  const s = await stat(p.sessionDir(id));
  return { id, slug, created_at: s.birthtime.toISOString() };
}

export async function deleteSession(p: Paths, id: string): Promise<void> {
  if (!(await sessionExists(p, id))) {
    throw new Error(`session not found: ${id}`);
  }
  await rm(p.sessionDir(id), { recursive: true, force: false });
}
