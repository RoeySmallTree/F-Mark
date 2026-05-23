// packages/kernel/src/tmux/naming.ts
import { createHash } from "node:crypto";
import { basename } from "node:path";

const MAX_NAME_LEN = 90;
const MAX_ID_IN_NAME = 32;

/**
 * Hashes the project root to an 8-char hex digest.
 *
 * NOTE: Callers MUST pass an absolute, canonicalized path (e.g. the result of
 * `realpathSync` on an `path.resolve`'d value). This helper does not canonicalize
 * its input. Equivalent paths with different casing, trailing slashes, or
 * symlinks will produce different hashes.
 */
export function projectRootHash(root: string): string {
  return createHash("sha256").update(root).digest("hex").slice(0, 8);
}

function baseSlug(root: string): string {
  const slug = basename(root)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return slug.length > 0 ? slug : "fmark";
}

function truncId(id: string): string {
  return id.length <= MAX_ID_IN_NAME ? id : id.slice(0, MAX_ID_IN_NAME);
}

/**
 * Returns the maximum basename length that still leaves room for the suffix
 * `-<hash8>-<kindMarker>-<id>` within `MAX_NAME_LEN`, given the literal `fmark-`
 * prefix.
 *
 *   total = "fmark-".length + basenameLen + "-".length + 8 + "-".length + kindMarker.length + "-".length + idLen
 *         = 6 + basenameLen + 1 + 8 + 1 + kindMarker.length + 1 + idLen
 *
 * Solve for basenameLen: basenameLen <= MAX_NAME_LEN - (17 + kindMarker.length + idLen)
 */
function maxBasenameLen(kindMarker: "ag" | "term", idLen: number): number {
  const overhead = "fmark-".length + 1 + 8 + 1 + kindMarker.length + 1 + idLen;
  return Math.max(1, MAX_NAME_LEN - overhead);
}

function truncBasename(slug: string, kindMarker: "ag" | "term", idLen: number): string {
  const max = maxBasenameLen(kindMarker, idLen);
  if (slug.length <= max) return slug;
  // Strip trailing hyphens left by mid-token truncation.
  return slug.slice(0, max).replace(/-+$/, "") || "fmark";
}

export function fmarkAgentSessionName(root: string, participantId: string): string {
  const id = truncId(participantId);
  const slug = truncBasename(baseSlug(root), "ag", id.length);
  return `fmark-${slug}-${projectRootHash(root)}-ag-${id}`;
}

export function fmarkTerminalSessionName(root: string, index: number): string {
  const idStr = String(index);
  const slug = truncBasename(baseSlug(root), "term", idStr.length);
  return `fmark-${slug}-${projectRootHash(root)}-term-${idStr}`;
}

const FMARK_RE = /^fmark-[a-z0-9-]+-[0-9a-f]{8}-(ag|term)-(.+)$/;

export function isFmarkSessionName(name: string): boolean {
  return FMARK_RE.test(name);
}

export type ParsedSession =
  | { kind: "agent"; participantId: string }
  | { kind: "terminal"; index: number };

export function parseFmarkSessionName(name: string): ParsedSession | null {
  const m = FMARK_RE.exec(name);
  if (!m) return null;
  const [, kind, rest] = m;
  if (kind === "ag") return { kind: "agent", participantId: rest! };
  // Strict: terminal index must be purely numeric.
  if (!/^\d+$/.test(rest!)) return null;
  const idx = Number.parseInt(rest!, 10);
  if (!Number.isFinite(idx)) return null;
  return { kind: "terminal", index: idx };
}
