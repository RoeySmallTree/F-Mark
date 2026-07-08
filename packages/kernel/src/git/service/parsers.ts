import type { GitFileStatus, GitHunk } from "@f-mark/shared";

export interface NumstatEntry {
  additions: number;
  deletions: number;
  binary: boolean;
  relPath: string;
  oldPath?: string;
}

interface NameStatusEntry {
  status: GitFileStatus;
  relPath: string;
  oldPath?: string;
}

/** Map a `git diff --name-status -z` record to status and paths. */
export function parseNameStatus(out: string): NameStatusEntry[] {
  const entries: NameStatusEntry[] = [];
  const tokens = out.split("\0").filter((t) => t.length > 0);
  let i = 0;
  while (i < tokens.length) {
    const result = parseNameStatusRecord(tokens, i);
    if (result.entry !== null) entries.push(result.entry);
    if (result.nextIndex <= i) break;
    i = result.nextIndex;
  }
  return entries;
}

function parseNameStatusRecord(
  tokens: string[],
  index: number,
): { entry: NameStatusEntry | null; nextIndex: number } {
  const code = tokens[index];
  if (code === undefined) return { entry: null, nextIndex: index + 1 };
  const letter = code[0];
  return letter === "R" || letter === "C"
    ? parseRenameStatus(tokens, index + 1)
    : parseSimpleStatus(tokens, index + 1, letter);
}

function parseRenameStatus(
  tokens: string[],
  index: number,
): { entry: NameStatusEntry | null; nextIndex: number } {
  const oldPath = tokens[index];
  const newPath = tokens[index + 1];
  if (oldPath === undefined || newPath === undefined) {
    return { entry: null, nextIndex: tokens.length };
  }
  return {
    entry: { status: "renamed", relPath: newPath, oldPath },
    nextIndex: index + 2,
  };
}

function parseSimpleStatus(
  tokens: string[],
  index: number,
  letter: string | undefined,
): { entry: NameStatusEntry | null; nextIndex: number } {
  const relPath = tokens[index];
  if (relPath === undefined) return { entry: null, nextIndex: tokens.length };
  return {
    entry: { status: statusFromNameStatusLetter(letter), relPath },
    nextIndex: index + 1,
  };
}

function statusFromNameStatusLetter(letter: string | undefined): GitFileStatus {
  if (letter === "A") return "added";
  if (letter === "D") return "deleted";
  return "modified";
}

const MAX_DIFF_PARSE_BYTES = 8 * 1024 * 1024;
const MAX_DIFF_HUNKS = 5000;

/** Parse a single-file unified diff into hunks. */
export function parseHunks(diff: string): GitHunk[] {
  const hunks: GitHunk[] = [];
  const capped =
    diff.length > MAX_DIFF_PARSE_BYTES
      ? diff.slice(0, MAX_DIFF_PARSE_BYTES)
      : diff;
  const lines = capped.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const headerRe = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
  let current: { header: string; meta: RegExpExecArray; body: string[] } | null =
    null;
  const flush = (): void => {
    if (current === null) return;
    const m = current.meta;
    hunks.push({
      id: `H${hunks.length}`,
      header: current.header,
      old_start: Number.parseInt(m[1] ?? "0", 10),
      old_lines: m[2] === undefined ? 1 : Number.parseInt(m[2], 10),
      new_start: Number.parseInt(m[3] ?? "0", 10),
      new_lines: m[4] === undefined ? 1 : Number.parseInt(m[4], 10),
      patch: current.body.join("\n"),
    });
    current = null;
  };
  for (const line of lines) {
    const m = headerRe.exec(line);
    if (m !== null) {
      flush();
      if (hunks.length >= MAX_DIFF_HUNKS) break;
      current = { header: line, meta: m, body: [] };
      continue;
    }
    if (current !== null) {
      if (line.startsWith("diff --git ")) {
        flush();
        continue;
      }
      current.body.push(line);
    }
  }
  flush();
  return hunks;
}

/** Synthesize a new-file unified diff (vs /dev/null) for untracked text. */
export function synthesizeNewFileDiff(relPath: string, text: string): string {
  const lines = text.length === 0 ? [] : text.split("\n");
  const endsWithNewline = text.endsWith("\n");
  const content = endsWithNewline ? lines.slice(0, -1) : lines;
  const count = content.length;
  const body = content.map((l) => `+${l}`);
  if (!endsWithNewline && count > 0) {
    body.push("\\ No newline at end of file");
  }
  const header = `@@ -0,0 +1,${count} @@`;
  return [
    `diff --git a/${relPath} b/${relPath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${relPath}`,
    header,
    ...body,
    "",
  ].join("\n");
}

/** Parse the NUL-record `--numstat -z` stream. */
export function parseNumstatZ(out: string): NumstatEntry[] {
  const tokens = out.split("\0");
  const entries: NumstatEntry[] = [];
  let i = 0;
  while (i < tokens.length) {
    const result = parseNumstatZRecord(tokens, i);
    if (result.entry !== null) entries.push(result.entry);
    if (result.nextIndex <= i) break;
    i = result.nextIndex;
  }
  return entries;
}

function parseNumstatZRecord(
  tokens: string[],
  index: number,
): { entry: NumstatEntry | null; nextIndex: number } {
  const head = tokens[index];
  const nextIndex = index + 1;
  if (head === undefined || head.length === 0) {
    return { entry: null, nextIndex };
  }
  const parts = head.split("\t");
  if (parts.length < 3) return { entry: null, nextIndex };
  const counts = parseNumstatCounts(parts[0], parts[1]);
  const inlinePath = parts.slice(2).join("\t");
  return inlinePath.length > 0
    ? { entry: { ...counts, relPath: inlinePath }, nextIndex }
    : parseNumstatRename(tokens, nextIndex, counts);
}

function parseNumstatCounts(
  addRaw = "0",
  delRaw = "0",
): Pick<NumstatEntry, "additions" | "deletions" | "binary"> {
  const binary = addRaw === "-" || delRaw === "-";
  return {
    additions: binary ? 0 : Number.parseInt(addRaw, 10) || 0,
    deletions: binary ? 0 : Number.parseInt(delRaw, 10) || 0,
    binary,
  };
}

function parseNumstatRename(
  tokens: string[],
  index: number,
  counts: Pick<NumstatEntry, "additions" | "deletions" | "binary">,
): { entry: NumstatEntry; nextIndex: number } {
  const oldPath = tokens[index] ?? "";
  const newPath = tokens[index + 1] ?? "";
  return {
    entry: { ...counts, relPath: newPath, oldPath },
    nextIndex: index + 2,
  };
}
