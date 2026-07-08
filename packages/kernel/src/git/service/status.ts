import { actionsForStatus } from "@f-mark/shared";
import type { GitChangedFile, GitFileStatus } from "@f-mark/shared";
import type { GitCommandExecutor } from "./command.js";
import { countAddedLines, looksBinary, readUntrackedForCount } from "./binary.js";
import { parseNameStatus, parseNumstatZ, type NumstatEntry } from "./parsers.js";
import { literalPathspec } from "./refs.js";

export class GitStatusService {
  constructor(private readonly git: GitCommandExecutor) {}

  async untrackedFiles(root: string): Promise<string[]> {
    const r = await this.git.run(root, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
    ]);
    if (r.exitCode !== 0) return [];
    return r.stdout.split("\0").filter((p) => p.length > 0);
  }

  async isBinaryPath(
    root: string,
    mergeBaseSha: string,
    relPath: string,
  ): Promise<boolean> {
    const r = await this.git.run(root, [
      "diff",
      "--numstat",
      "--end-of-options",
      mergeBaseSha,
      "--",
      literalPathspec(relPath),
    ]);
    if (r.exitCode !== 0) return false;
    const first = r.stdout.split("\n").find((l) => l.length > 0);
    return first?.startsWith("-\t-\t") ?? false;
  }

  async changedFiles(
    root: string,
    mergeBaseSha: string,
  ): Promise<GitChangedFile[]> {
    const out = await this.diffChangedFiles(root, mergeBaseSha);
    await this.addUntracked(root, await this.untrackedFiles(root), out);
    return out;
  }

  private async diffChangedFiles(
    root: string,
    mergeBaseSha: string,
  ): Promise<GitChangedFile[]> {
    const [numstatRes, nameStatusRes] = await Promise.all([
      this.git.run(root, [
        "diff",
        "--numstat",
        "--find-renames",
        "-z",
        "--end-of-options",
        mergeBaseSha,
      ]),
      this.git.run(root, [
        "diff",
        "--name-status",
        "--find-renames",
        "-z",
        "--end-of-options",
        mergeBaseSha,
      ]),
    ]);

    const numstatByPath = new Map<string, NumstatEntry>();
    parseNumstatZ(numstatRes.stdout).forEach((e) => {
      numstatByPath.set(e.relPath, e);
    });

    const out: GitChangedFile[] = [];
    for (const ns of parseNameStatus(nameStatusRes.stdout)) {
      const num = numstatByPath.get(ns.relPath);
      out.push(createChangedFile(ns, num));
    }
    return out;
  }

  private async addUntracked(
    root: string,
    untracked: string[],
    out: GitChangedFile[],
  ): Promise<void> {
    const known = new Set(out.map((f) => f.rel_path));
    const fresh = untracked.filter((rel) => !known.has(rel));
    // Each untracked file's head read is independent disk I/O. Doing them
    // sequentially serializes hundreds of reads on the session-load hot path
    // (~100ms on a tree with a large untracked set). Overlap the I/O, but bound
    // the concurrency: a huge untracked set must not exhaust file descriptors,
    // and each read can buffer up to 16 MB. Output order is preserved (entries
    // map 1:1 onto `fresh`), so the result is byte-identical to the serial loop.
    const entries = await mapWithConcurrency(fresh, 8, async (rel) => {
      const head = await readUntrackedForCount(root, rel);
      const binary = head !== null && looksBinary(head.buf);
      const additions = !binary && head !== null ? countAddedLines(head.buf) : 0;
      const status: GitFileStatus = binary ? "binary-untracked" : "untracked";
      return {
        rel_path: rel,
        status,
        additions,
        deletions: 0,
        binary,
        actions: actionsForStatus(status),
      } satisfies GitChangedFile;
    });
    out.push(...entries);
  }
}

/** Order-preserving bounded-concurrency map: at most `limit` `fn`s run at once. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (let i = cursor++; i < items.length; i = cursor++) {
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function createChangedFile(
  ns: { status: GitFileStatus; relPath: string; oldPath?: string },
  num: NumstatEntry | undefined,
): GitChangedFile {
  const binary = num?.binary ?? false;
  const status: GitFileStatus = binary
    ? (`binary-${ns.status}` as GitFileStatus)
    : ns.status;
  return {
    rel_path: ns.relPath,
    status,
    ...(ns.oldPath !== undefined ? { old_path: ns.oldPath } : {}),
    additions: num?.additions ?? 0,
    deletions: num?.deletions ?? 0,
    binary,
    actions: actionsForStatus(status),
  };
}
