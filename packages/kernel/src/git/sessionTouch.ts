/* Session-touch filter for `mode=session` diffs (design §8.1).

   `git diff` reports every change in the worktree; current-session mode narrows
   that to files THIS session's agents actually wrote. We derive the set from
   the session's `tool-use` events, normalizing the `file_path` of mutating
   tools (Write/Edit/MultiEdit/NotebookEdit) to a project-root-relative path. */

import { readEvents } from "../events/reader.js";
import type { Paths } from "../paths.js";
import { isAbsolute, relative, sep } from "node:path";

/* Tool names (case-insensitive, separators stripped) that mutate a file and
   whose input carries a `file_path`. Read tools are intentionally excluded —
   a read doesn't make a file "session-touched". */
const MUTATING_TOOLS = new Set([
  "write",
  "edit",
  "multiedit",
  "notebookedit",
  "create",
  "applypatch",
]);

function normalizeToolName(name: unknown): string {
  if (typeof name !== "string") return "";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Pull a `file_path`-like string from a tool-use input object. Mirrors the
    renderer's `filePathFrom` key precedence. */
function filePathFromInput(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  for (const key of [
    "file_path",
    "filePath",
    "notebook_path",
    "path",
    "absPath",
    "absolute_path",
  ]) {
    const v = input[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  const file = input.file;
  if (isRecord(file)) {
    for (const key of ["file_path", "filePath", "path", "absPath"]) {
      const v = file[key];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  return undefined;
}

/** Convert an absolute-or-relative tool path to a root-relative POSIX path, or
    null when it escapes the root. */
function toRootRelative(root: string, p: string): string | null {
  const abs = isAbsolute(p) ? p : `${root}${sep}${p}`;
  const rel = relative(root, abs);
  if (rel.length === 0) return null;
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

/** The set of root-relative paths this session's mutating tool-use events
    touched. Empty set on any read error (the route degrades to "no matches"). */
export async function sessionTouchedFiles(
  paths: Paths,
  sessionId: string,
  root: string,
): Promise<Set<string>> {
  const touched = new Set<string>();
  let events;
  try {
    events = await readEvents(paths, sessionId, { kinds: ["tool-use"] });
  } catch {
    return touched;
  }
  for (const ev of events) {
    const payload = ev.payload as { tool_name?: unknown; input?: unknown };
    if (!MUTATING_TOOLS.has(normalizeToolName(payload.tool_name))) continue;
    const raw = filePathFromInput(payload.input);
    if (raw === undefined) continue;
    const rel = toRootRelative(root, raw);
    if (rel !== null) touched.add(rel);
  }
  return touched;
}
