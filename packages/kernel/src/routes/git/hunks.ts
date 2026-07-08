import { actionsForStatus, type GitChangedFile, type GitDiffMode, type GitHunk } from "@f-mark/shared";
import type { GitService } from "../../git/service.js";
import { parseHunks, synthesizeNewFileDiff } from "../../git/service.js";
import { sessionTouchedFiles } from "../../git/sessionTouch.js";
import type { KnownRoot } from "../rootScope.js";
import type { GitTextFileReader } from "./content.js";

export class GitSessionGate {
  async isAllowed(
    known: KnownRoot,
    mode: GitDiffMode,
    sessionId: string | undefined,
    relPosix: string,
    oldPath: string | undefined,
  ): Promise<boolean> {
    if (mode !== "session") return true;
    if (typeof sessionId !== "string" || sessionId.length === 0) return false;
    const touched = await sessionTouchedFiles(known.paths, sessionId, known.root);
    return touched.has(relPosix) || (oldPath !== undefined && touched.has(oldPath));
  }
}

export interface ChangedFileLookup {
  entry: GitChangedFile | undefined;
  allowed: boolean;
}

export class GitChangeSetService {
  constructor(
    private readonly git: GitService,
    private readonly gate = new GitSessionGate(),
  ) {}

  async listForMode(
    known: KnownRoot,
    mergeBaseSha: string,
    mode: GitDiffMode,
    sessionId: string | undefined,
  ): Promise<GitChangedFile[]> {
    const files = await this.git.changedFiles(known.root, mergeBaseSha);
    if (mode !== "session") return files;
    if (typeof sessionId !== "string" || sessionId.length === 0) return [];
    const touched = await sessionTouchedFiles(known.paths, sessionId, known.root);
    return files.filter(
      (file) =>
        touched.has(file.rel_path) ||
        (file.old_path !== undefined && touched.has(file.old_path)),
    );
  }

  async findAllowed(
    known: KnownRoot,
    mergeBaseSha: string,
    relPosix: string,
    mode: GitDiffMode,
    sessionId: string | undefined,
  ): Promise<ChangedFileLookup> {
    const entry = await this.find(known.root, mergeBaseSha, relPosix);
    if (entry === undefined) return { entry, allowed: false };
    return {
      entry,
      allowed: await this.gate.isAllowed(
        known,
        mode,
        sessionId,
        entry.rel_path,
        entry.old_path,
      ),
    };
  }

  async find(
    root: string,
    mergeBaseSha: string,
    relPosix: string,
  ): Promise<GitChangedFile | undefined> {
    const changed = await this.git.changedFiles(root, mergeBaseSha);
    return changed.find((file) => file.rel_path === relPosix || file.old_path === relPosix);
  }
}

export class GitHunkComputer {
  constructor(
    private readonly git: GitService,
    private readonly textReader: GitTextFileReader,
  ) {}

  async compute(
    root: string,
    mergeBaseSha: string,
    entry: GitChangedFile,
  ): Promise<GitHunk[] | null> {
    if (entry.binary) return null;
    if (entry.status === "untracked") return this.untrackedHunks(root, entry.rel_path);
    if (entry.status === "modified") return this.modifiedHunks(root, mergeBaseSha, entry);
    const diff = await this.git.fileDiff(root, mergeBaseSha, entry.rel_path, entry.old_path);
    return tagHunks(parseHunks(diff), "worktree");
  }

  actionsFor(entry: GitChangedFile) {
    return actionsForStatus(entry.status);
  }

  private async untrackedHunks(root: string, relPosix: string): Promise<GitHunk[] | null> {
    const head = await this.textReader.readTextHeadGuarded(root, relPosix);
    if (head === "binary") return null;
    return tagHunks(parseHunks(synthesizeNewFileDiff(relPosix, head ?? "")), "worktree");
  }

  private async modifiedHunks(
    root: string,
    mergeBaseSha: string,
    entry: GitChangedFile,
  ): Promise<GitHunk[]> {
    const [worktreeDiff, cachedDiff] = await Promise.all([
      this.git.fileDiffWorktree(root, entry.rel_path, entry.old_path),
      this.git.fileDiffCached(root, mergeBaseSha, entry.rel_path, entry.old_path),
    ]);
    return [
      ...tagHunks(parseHunks(worktreeDiff), "worktree"),
      ...tagHunks(parseHunks(cachedDiff), "index"),
    ];
  }
}

function tagHunks(
  hunks: GitHunk[],
  origin: "worktree" | "index",
): GitHunk[] {
  const prefix = origin === "index" ? "I" : "H";
  return hunks.map((hunk, index) => ({ ...hunk, id: `${prefix}${index}`, origin }));
}
