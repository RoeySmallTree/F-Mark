import { createHash } from "node:crypto";
import { cachedRealpathSync } from "./realpathCache.js";

/* pathId is a deterministic 48-bit fingerprint derived from the canonical
   absolute path. Used as a partition key across managed-agent state, WS
   message envelopes, tmux session tags, and hook POST bodies. 48 bits is
   sufficient for a single user's path count; the collision probability is
   negligible up to millions of paths. */
const PATH_ID_LENGTH = 12;

export function computePathId(absPath: string): string {
  const canonical = canonicalize(absPath);
  return createHash("sha256").update(canonical).digest("hex").slice(0, PATH_ID_LENGTH);
}

/* Canonicalize via realpathSync. If the path does not exist on disk (yet),
   fall back to the input as-is — this lets callers compute an id for a path
   they're about to create. Throws for everything except ENOENT. */
function canonicalize(absPath: string): string {
  try {
    return cachedRealpathSync(absPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return absPath;
    throw err;
  }
}
