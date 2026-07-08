import { open } from "node:fs/promises";
import { resolveWorkingFileUnderRoot } from "../workingFile.js";

const MAX_UNTRACKED_COUNT_BYTES = 16 * 1024 * 1024;

/** A NUL byte in the first 8000 bytes is git's own "looks binary" rule. */
export function looksBinary(buf: Buffer): boolean {
  const span = Math.min(buf.length, 8000);
  for (let i = 0; i < span; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

export async function readUntrackedForCount(
  root: string,
  relPath: string,
): Promise<{ buf: Buffer } | null> {
  const resolved = await resolveWorkingFileUnderRoot(root, relPath);
  if (resolved.kind !== "file") return null;
  try {
    const fh = await open(resolved.abs, "r");
    try {
      const size = Math.min(resolved.size, MAX_UNTRACKED_COUNT_BYTES);
      const buf = Buffer.alloc(size);
      if (size > 0) await fh.read(buf, 0, size, 0);
      return { buf };
    } finally {
      await fh.close();
    }
  } catch {
    return null;
  }
}

export function countAddedLines(buf: Buffer): number {
  const text = buf.toString("utf8");
  if (text.length === 0) return 0;
  const lines = text.split("\n");
  return text.endsWith("\n") ? lines.length - 1 : lines.length;
}
