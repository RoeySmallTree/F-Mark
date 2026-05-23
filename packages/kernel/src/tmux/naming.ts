// packages/kernel/src/tmux/naming.ts
import { createHash } from "node:crypto";
import { basename } from "node:path";

const MAX_NAME_LEN = 90;
const MAX_ID_IN_NAME = 32;

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

export function fmarkAgentSessionName(root: string, participantId: string): string {
  const name = `fmark-${baseSlug(root)}-${projectRootHash(root)}-ag-${truncId(participantId)}`;
  return name.length <= MAX_NAME_LEN ? name : name.slice(0, MAX_NAME_LEN);
}

export function fmarkTerminalSessionName(root: string, index: number): string {
  return `fmark-${baseSlug(root)}-${projectRootHash(root)}-term-${index}`;
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
  const idx = Number.parseInt(rest!, 10);
  if (!Number.isFinite(idx)) return null;
  return { kind: "terminal", index: idx };
}
