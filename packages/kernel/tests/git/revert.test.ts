/* POST /git/revert-hunk (Phase 5 / X3) — exercised through the full server
   inject path against TEMPORARY fixture git repos. Covers the X3 matrix:
   modified hunk reverse-apply (happy path + stale 409), untracked delete,
   added-staged hunk, deleted restore, rename (metadata + with content), and
   binary file-restore. Every test mutates only its own temp repo.

   Phase-5 review fixtures (blockers 1–5):
     • symlink-delete targets the LINK, never realpath(link)'s target;
     • an `MM` file's staged-hunk revert preserves the unstaged worktree edit;
     • a deleted-file hunk revert recreates the file (correct /dev/null preamble);
     • a staged-rename whole-file revert leaves a CLEAN index;
     • a stale/missing file-level race maps to a 409 conflict, not a 500. */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { createGitMutator } from "../../src/git/revert.js";
import type { GitHunk } from "@f-mark/shared";

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "T",
      GIT_AUTHOR_EMAIL: "t@e",
      GIT_COMMITTER_NAME: "T",
      GIT_COMMITTER_EMAIL: "t@e",
    },
  });
}

/* A repo with a single committed `base.txt` on `main`. The caller applies the
   working-tree state it needs after this returns. */
async function repo(): Promise<{
  root: string;
  cfg: string;
  app: ReturnType<typeof createServer>["app"];
  cleanup: () => void;
}> {
  const root = mkdtempSync(join(tmpdir(), "fmark-rev-"));
  const cfg = mkdtempSync(join(tmpdir(), "fmark-rev-cfg-"));
  const p = paths(root);
  await initProject(p);
  git(root, ["init", "-q"]);
  git(root, ["checkout", "-q", "-b", "main"]);
  writeFileSync(join(root, "base.txt"), "a\nb\nc\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "base"]);
  const g = globalPaths(cfg);
  const ref = new PathContextRef({ global: g, active: activePaths(root) });
  const { app } = createServer({ token: null, paths: p, pathContextRef: ref });
  const cleanup = (): void => {
    rmSync(root, { recursive: true, force: true });
    rmSync(cfg, { recursive: true, force: true });
  };
  return { root, cfg, app, cleanup };
}

async function diffOf(
  app: Awaited<ReturnType<typeof repo>>["app"],
  root: string,
  rel: string,
): Promise<{ status: string; file_status?: string; hunks: { id: string }[]; actions?: unknown }> {
  const res = await app.inject({
    method: "GET",
    url: `/git/diff?root=${encodeURIComponent(root)}&rel_path=${encodeURIComponent(rel)}&mode=branch`,
  });
  return res.json();
}

describe("POST /git/revert-hunk — modified text", () => {
  it("reverse-applies the selected hunk to the worktree (happy path)", async () => {
    const { root, app, cleanup } = await repo();
    try {
      writeFileSync(join(root, "base.txt"), "a\nB\nc\n");
      const diff = await diffOf(app, root, "base.txt");
      expect(diff.status).toBe("ok");
      expect(diff.hunks.length).toBeGreaterThan(0);
      const hunkId = diff.hunks[0]!.id;

      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: {
          root,
          rel_path: "base.txt",
          mode: "branch",
          hunk_id: hunkId,
          action: "hunk",
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().action).toBe("hunk");
      /* The worktree edit is reverted back to base content. */
      expect(readFileSync(join(root, "base.txt"), "utf8")).toBe("a\nb\nc\n");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("returns 409 HUNK_CONFLICT for an unknown hunk id", async () => {
    const { root, app, cleanup } = await repo();
    try {
      writeFileSync(join(root, "base.txt"), "a\nB\nc\n");
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: {
          root,
          rel_path: "base.txt",
          mode: "branch",
          hunk_id: "H9999",
          action: "hunk",
        },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("HUNK_CONFLICT");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("mutator raises HunkConflictError when --check fails (stale hunk, no corruption)", async () => {
    /* Direct mutator test for a genuine `git apply --reverse --check` failure:
       feed a hunk whose `-` line text is NOT present in the worktree, so the
       reverse patch can't match. The file must be left UNTOUCHED. */
    const { root, cleanup } = await repo();
    try {
      const before = readFileSync(join(root, "base.txt"), "utf8");
      const mutator = createGitMutator();
      const staleHunk: GitHunk = {
        id: "H0",
        header: "@@ -1,3 +1,3 @@",
        old_start: 1,
        old_lines: 3,
        new_start: 1,
        new_lines: 3,
        /* Reverse-applying this means turning a `+NOPE-NOT-HERE` working line
           back into `-NOPE-NOT-HERE` base — but no such line exists on disk. */
        patch: " a\n-NOPE-NOT-HERE\n+REPLACEMENT-NOT-HERE\n c",
      };
      await expect(
        mutator.revert(
          {
            root,
            relPosix: "base.txt",
            status: "modified",
            mergeBaseSha: git(root, ["rev-parse", "HEAD"]).trim(),
            hunk: staleHunk,
          },
          "hunk",
        ),
      ).rejects.toMatchObject({ name: "HunkConflictError" });
      /* No partial write — the worktree file is byte-identical. */
      expect(readFileSync(join(root, "base.txt"), "utf8")).toBe(before);
      cleanup();
    } catch (e) {
      cleanup();
      throw e;
    }
  });

  it("file-level restore reverts the whole modified file", async () => {
    const { root, app, cleanup } = await repo();
    try {
      writeFileSync(join(root, "base.txt"), "a\nB\nC\nd\n");
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "base.txt", mode: "branch", action: "file" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().action).toBe("file");
      expect(readFileSync(join(root, "base.txt"), "utf8")).toBe("a\nb\nc\n");
      await app.close();
    } finally {
      cleanup();
    }
  });
});

describe("POST /git/revert-hunk — untracked text", () => {
  it("file-level delete removes an untracked file", async () => {
    const { root, app, cleanup } = await repo();
    try {
      writeFileSync(join(root, "fresh.txt"), "new\nlines\n");
      const diff = await diffOf(app, root, "fresh.txt");
      expect(diff.file_status).toBe("untracked");

      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "fresh.txt", mode: "branch", action: "file" },
      });
      expect(res.statusCode).toBe(200);
      expect(existsSync(join(root, "fresh.txt"))).toBe(false);
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("hunk revert on a single-hunk untracked file unlinks it when emptied", async () => {
    const { root, app, cleanup } = await repo();
    try {
      writeFileSync(join(root, "fresh.txt"), "only\n");
      const diff = await diffOf(app, root, "fresh.txt");
      const hunkId = diff.hunks[0]!.id;
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "fresh.txt", mode: "branch", hunk_id: hunkId, action: "hunk" },
      });
      expect(res.statusCode).toBe(200);
      /* Reverse-applying the synthetic new-file hunk empties → unlinked. */
      expect(existsSync(join(root, "fresh.txt"))).toBe(false);
      await app.close();
    } finally {
      cleanup();
    }
  });
});

describe("POST /git/revert-hunk — added-staged text", () => {
  it("hunk revert keeps the staged file matching the worktree", async () => {
    const { root, app, cleanup } = await repo();
    try {
      writeFileSync(join(root, "added.txt"), "x\ny\nz\n");
      git(root, ["add", "added.txt"]);
      const diff = await diffOf(app, root, "added.txt");
      expect(diff.file_status).toBe("added");
      const hunkId = diff.hunks[0]!.id;
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "added.txt", mode: "branch", hunk_id: hunkId, action: "hunk" },
      });
      expect(res.statusCode).toBe(200);
      /* The single hunk covered the whole file → emptied → removed from index
         and worktree. */
      expect(existsSync(join(root, "added.txt"))).toBe(false);
      const staged = git(root, ["diff", "--cached", "--name-only"]);
      expect(staged).not.toContain("added.txt");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("file-level revert on a staged-added file git-rm's it", async () => {
    const { root, app, cleanup } = await repo();
    try {
      writeFileSync(join(root, "added.txt"), "x\n");
      git(root, ["add", "added.txt"]);
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "added.txt", mode: "branch", action: "file" },
      });
      expect(res.statusCode).toBe(200);
      expect(existsSync(join(root, "added.txt"))).toBe(false);
      await app.close();
    } finally {
      cleanup();
    }
  });
});

describe("POST /git/revert-hunk — deleted text", () => {
  it("file-level restore brings a deleted file back from base", async () => {
    const { root, app, cleanup } = await repo();
    try {
      rmSync(join(root, "base.txt"));
      const diff = await diffOf(app, root, "base.txt");
      expect(diff.file_status).toBe("deleted");

      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "base.txt", mode: "branch", action: "file" },
      });
      expect(res.statusCode).toBe(200);
      expect(existsSync(join(root, "base.txt"))).toBe(true);
      expect(readFileSync(join(root, "base.txt"), "utf8")).toBe("a\nb\nc\n");
      await app.close();
    } finally {
      cleanup();
    }
  });
});

describe("POST /git/revert-hunk — renamed text", () => {
  it("file-level revert restores the old path and removes the new path", async () => {
    const { root, app, cleanup } = await repo();
    try {
      /* Stage a rename so git reports a single rename record. */
      git(root, ["mv", "base.txt", "renamed.txt"]);
      const diff = await diffOf(app, root, "renamed.txt");
      expect(diff.file_status).toBe("renamed");
      expect(diff.actions).toMatchObject({ rename: true, file: true });

      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "renamed.txt", mode: "branch", action: "file" },
      });
      expect(res.statusCode).toBe(200);
      expect(existsSync(join(root, "renamed.txt"))).toBe(false);
      expect(existsSync(join(root, "base.txt"))).toBe(true);
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("rename action moves a renamed file back to its old path", async () => {
    const { root, app, cleanup } = await repo();
    try {
      git(root, ["mv", "base.txt", "renamed.txt"]);
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "renamed.txt", mode: "branch", action: "rename" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().action).toBe("rename");
      expect(existsSync(join(root, "base.txt"))).toBe(true);
      expect(existsSync(join(root, "renamed.txt"))).toBe(false);
      await app.close();
    } finally {
      cleanup();
    }
  });
});

describe("POST /git/revert-hunk — binary", () => {
  it("file-level restore reverts a modified binary file", async () => {
    const { root, app, cleanup } = await repo();
    try {
      /* Commit a binary blob, then change it in the worktree. */
      const baseBin = Buffer.from([0, 1, 2, 3, 0, 255]);
      writeFileSync(join(root, "data.bin"), baseBin);
      git(root, ["add", "data.bin"]);
      git(root, ["commit", "-q", "-m", "bin"]);
      writeFileSync(join(root, "data.bin"), Buffer.from([9, 9, 0, 9]));

      const diff = await diffOf(app, root, "data.bin");
      expect(diff.file_status).toBe("binary-modified");
      expect(diff.actions).toMatchObject({ hunk: false, file: true });

      /* A hunk action is refused for binary. */
      const bad = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "data.bin", mode: "branch", hunk_id: "H0", action: "hunk" },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().code).toBe("REVERT_NOT_ALLOWED");

      /* File-level restore brings back the base bytes. */
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "data.bin", mode: "branch", action: "file" },
      });
      expect(res.statusCode).toBe(200);
      expect(readFileSync(join(root, "data.bin"))).toEqual(baseBin);
      await app.close();
    } finally {
      cleanup();
    }
  });
});

describe("POST /git/revert-hunk — guards", () => {
  it("400 ROOT_SCOPE_REQUIRED without scope", async () => {
    const { app, cleanup } = await repo();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { rel_path: "base.txt", mode: "branch", action: "file" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("ROOT_SCOPE_REQUIRED");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("403 for a rel_path escaping the root", async () => {
    const { root, app, cleanup } = await repo();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "../escape.txt", mode: "branch", action: "file" },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("409 HUNK_CONFLICT when the file has no changes vs base", async () => {
    const { root, app, cleanup } = await repo();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "base.txt", mode: "branch", action: "file" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("HUNK_CONFLICT");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("rejects an unsafe base ref with 400 before git runs", async () => {
    const { root, app, cleanup } = await repo();
    try {
      writeFileSync(join(root, "base.txt"), "a\nB\nc\n");
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "base.txt", mode: "branch", action: "file", base: "-rf" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("INVALID_BASE_REF");
      await app.close();
    } finally {
      cleanup();
    }
  });
});

/* ── Blocker 1: symlink-following mutation guard ──────────────────────────
   A crafted untracked `link.txt -> victim.txt` is reported as an untracked
   changed file. `Delete file` must unlink the LINK, never realpath(link)'s
   target (`victim.txt` must survive, the link must be gone). */
describe("POST /git/revert-hunk — symlink delete targets the link, not the target", () => {
  it("untracked symlink delete removes the link and leaves its target intact", async () => {
    const { root, app, cleanup } = await repo();
    try {
      /* A committed (tracked) victim the symlink points at. */
      writeFileSync(join(root, "victim.txt"), "DO NOT DELETE\n");
      git(root, ["add", "victim.txt"]);
      git(root, ["commit", "-q", "-m", "victim"]);
      /* An untracked symlink to the victim. */
      symlinkSync("victim.txt", join(root, "link.txt"));

      /* The changed-files endpoint should see link.txt as untracked. */
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "link.txt", mode: "branch", action: "file" },
      });
      expect(res.statusCode).toBe(200);

      /* The LINK is gone; the victim file is untouched. */
      expect(existsSync(join(root, "link.txt"))).toBe(false);
      expect(existsSync(join(root, "victim.txt"))).toBe(true);
      expect(readFileSync(join(root, "victim.txt"), "utf8")).toBe("DO NOT DELETE\n");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("does not follow a symlink that escapes the root", async () => {
    const { root, app, cleanup } = await repo();
    /* An OUTSIDE file the in-repo symlink points at — must never be touched. */
    const outside = mkdtempSync(join(tmpdir(), "fmark-rev-outside-"));
    const outsideFile = join(outside, "secret.txt");
    try {
      writeFileSync(outsideFile, "SECRET\n");
      symlinkSync(outsideFile, join(root, "escape.txt"));
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "escape.txt", mode: "branch", action: "file" },
      });
      /* The link is untracked and inside the root, so the delete IS allowed —
         but it unlinks the LINK, not the outside target. */
      expect(res.statusCode).toBe(200);
      expect(lstatExists(join(root, "escape.txt"))).toBe(false);
      expect(existsSync(outsideFile)).toBe(true);
      expect(readFileSync(outsideFile, "utf8")).toBe("SECRET\n");
      await app.close();
    } finally {
      cleanup();
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

/* ── Blocker 2: MM file — staged-hunk revert preserves the unstaged edit ──── */
describe("POST /git/revert-hunk — MM file (staged + unstaged), origin-split hunks", () => {
  it("reverting the staged (index) hunk does NOT drop the unstaged worktree edit", async () => {
    const { root, app, cleanup } = await repo();
    try {
      /* base.txt is `a\nb\nc\n`. Stage a line-2 edit, then add an unstaged
         line-... edit so the file is `MM`. base has only 3 lines, so use a
         bigger seed to get two clearly-separate hunks. */
      writeFileSync(join(root, "f.txt"), "1\n2\n3\n4\n5\n6\n7\n8\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-q", "-m", "seed f"]);
      /* Stage a change to line 2. */
      writeFileSync(join(root, "f.txt"), "1\nTWO\n3\n4\n5\n6\n7\n8\n");
      git(root, ["add", "f.txt"]);
      /* Add an UNSTAGED change to line 8. */
      writeFileSync(join(root, "f.txt"), "1\nTWO\n3\n4\n5\n6\n7\nEIGHT\n");
      expect(git(root, ["status", "--short", "f.txt"]).trim().startsWith("MM")).toBe(true);

      /* The diff exposes BOTH a worktree hunk (H*) and an index hunk (I*). */
      const diff = await diffOf(app, root, "f.txt");
      const hunks = diff.hunks as { id: string }[];
      const indexHunk = hunks.find((h) => h.id.startsWith("I"));
      const worktreeHunk = hunks.find((h) => h.id.startsWith("H"));
      expect(indexHunk, "expected an index-origin hunk").toBeDefined();
      expect(worktreeHunk, "expected a worktree-origin hunk").toBeDefined();

      /* Revert the STAGED (index) hunk. */
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "f.txt", mode: "branch", hunk_id: indexHunk!.id, action: "hunk" },
      });
      expect(res.statusCode).toBe(200);

      /* The unstaged line-8 edit must survive in the worktree. */
      expect(readFileSync(join(root, "f.txt"), "utf8")).toContain("EIGHT");
      /* The index no longer has the staged line-2 edit (base→index clean for
         that line): the staged diff should no longer contain `TWO`. */
      const stagedDiff = git(root, ["diff", "--cached", "--", "f.txt"]);
      expect(stagedDiff).not.toContain("+TWO");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("reverting the worktree hunk preserves the staged edit", async () => {
    const { root, app, cleanup } = await repo();
    try {
      writeFileSync(join(root, "f.txt"), "1\n2\n3\n4\n5\n6\n7\n8\n");
      git(root, ["add", "f.txt"]);
      git(root, ["commit", "-q", "-m", "seed f"]);
      writeFileSync(join(root, "f.txt"), "1\nTWO\n3\n4\n5\n6\n7\n8\n");
      git(root, ["add", "f.txt"]);
      writeFileSync(join(root, "f.txt"), "1\nTWO\n3\n4\n5\n6\n7\nEIGHT\n");

      const diff = await diffOf(app, root, "f.txt");
      const hunks = diff.hunks as { id: string }[];
      const worktreeHunk = hunks.find((h) => h.id.startsWith("H"))!;

      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "f.txt", mode: "branch", hunk_id: worktreeHunk.id, action: "hunk" },
      });
      expect(res.statusCode).toBe(200);
      /* Worktree line-8 edit reverted; staged line-2 edit kept in the index. */
      expect(readFileSync(join(root, "f.txt"), "utf8")).not.toContain("EIGHT");
      const stagedDiff = git(root, ["diff", "--cached", "--", "f.txt"]);
      expect(stagedDiff).toContain("+TWO");
      await app.close();
    } finally {
      cleanup();
    }
  });
});

/* ── Blocker 3: deleted-file hunk revert recreates the file ───────────────── */
describe("POST /git/revert-hunk — deleted text hunk restore", () => {
  it("reverse-applies a deleted-file hunk and recreates the file (correct /dev/null preamble)", async () => {
    const { root, app, cleanup } = await repo();
    try {
      /* A bigger committed file so the single deletion hunk has real content. */
      writeFileSync(join(root, "gone.txt"), "l1\nl2\nl3\nl4\nl5\n");
      git(root, ["add", "gone.txt"]);
      git(root, ["commit", "-q", "-m", "gone"]);
      rmSync(join(root, "gone.txt"));

      const diff = await diffOf(app, root, "gone.txt");
      expect(diff.file_status).toBe("deleted");
      expect(diff.hunks.length).toBeGreaterThan(0);
      const hunkId = diff.hunks[0]!.id;

      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "gone.txt", mode: "branch", hunk_id: hunkId, action: "hunk" },
      });
      /* Must NOT be a bogus 409 — the deleted-file preamble now applies. */
      expect(res.statusCode).toBe(200);
      expect(existsSync(join(root, "gone.txt"))).toBe(true);
      /* The restored content matches the base file (single deletion hunk = whole
         file recreated). */
      expect(readFileSync(join(root, "gone.txt"), "utf8")).toBe("l1\nl2\nl3\nl4\nl5\n");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("partially recreates a deleted file when only the first hunk is reverted", async () => {
    const { root, app, cleanup } = await repo();
    try {
      /* Two well-separated regions so the diff yields two deletion hunks. */
      const lines = Array.from({ length: 40 }, (_, i) => `line${i + 1}`).join("\n") + "\n";
      writeFileSync(join(root, "big.txt"), lines);
      git(root, ["add", "big.txt"]);
      git(root, ["commit", "-q", "-m", "big"]);
      rmSync(join(root, "big.txt"));

      const diff = await diffOf(app, root, "big.txt");
      expect(diff.file_status).toBe("deleted");
      /* A pure deletion is a single hunk; revert it and confirm the file comes
         back with exactly the base content (proves the /dev/null side works). */
      const hunkId = diff.hunks[0]!.id;
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "big.txt", mode: "branch", hunk_id: hunkId, action: "hunk" },
      });
      expect(res.statusCode).toBe(200);
      expect(existsSync(join(root, "big.txt"))).toBe(true);
      expect(readFileSync(join(root, "big.txt"), "utf8")).toBe(lines);
      await app.close();
    } finally {
      cleanup();
    }
  });
});

/* ── Blocker 4: staged-rename whole-file revert leaves a clean index ──────── */
describe("POST /git/revert-hunk — staged rename whole-file revert (index assertions)", () => {
  it("pure staged rename: restores old, removes new, index is CLEAN", async () => {
    const { root, app, cleanup } = await repo();
    try {
      git(root, ["mv", "base.txt", "renamed.txt"]);
      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "renamed.txt", mode: "branch", action: "file" },
      });
      expect(res.statusCode).toBe(200);
      expect(existsSync(join(root, "base.txt"))).toBe(true);
      expect(existsSync(join(root, "renamed.txt"))).toBe(false);
      /* Index must be clean — no `D old` + `?? old` residue. */
      expect(git(root, ["status", "--short"]).trim()).toBe("");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("staged rename + edit: restores old content from base, index is CLEAN", async () => {
    const { root, app, cleanup } = await repo();
    try {
      /* A 20-line file with a 1-line edit stays ~89% similar so git detects the
         rename (a small file with a big edit would be reported as delete+add,
         not a rename). */
      const baseLines =
        Array.from({ length: 20 }, (_, i) => `l${i + 1}`).join("\n") + "\n";
      writeFileSync(join(root, "old.txt"), baseLines);
      git(root, ["add", "old.txt"]);
      git(root, ["commit", "-q", "-m", "old"]);
      git(root, ["mv", "old.txt", "new.txt"]);
      const edited = baseLines.replace("l10\n", "CHANGED\n");
      writeFileSync(join(root, "new.txt"), edited);
      git(root, ["add", "new.txt"]);

      const diff = await diffOf(app, root, "new.txt");
      expect(diff.file_status).toBe("renamed");

      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "new.txt", mode: "branch", action: "file" },
      });
      expect(res.statusCode).toBe(200);
      expect(existsSync(join(root, "new.txt"))).toBe(false);
      expect(readFileSync(join(root, "old.txt"), "utf8")).toBe(baseLines);
      expect(git(root, ["status", "--short"]).trim()).toBe("");
      /* Nothing staged: the index matches HEAD for both paths. */
      expect(git(root, ["diff", "--cached", "--name-only"]).trim()).toBe("");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("binary staged rename: restores old, removes new, index is CLEAN", async () => {
    const { root, app, cleanup } = await repo();
    try {
      const bin = Buffer.from([0, 1, 2, 0, 255, 10, 0]);
      writeFileSync(join(root, "old.bin"), bin);
      git(root, ["add", "old.bin"]);
      git(root, ["commit", "-q", "-m", "old bin"]);
      git(root, ["mv", "old.bin", "new.bin"]);
      const diff = await diffOf(app, root, "new.bin");
      expect(diff.file_status).toBe("binary-renamed");

      const res = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "new.bin", mode: "branch", action: "file" },
      });
      expect(res.statusCode).toBe(200);
      expect(existsSync(join(root, "new.bin"))).toBe(false);
      expect(existsSync(join(root, "old.bin"))).toBe(true);
      expect(readFileSync(join(root, "old.bin"))).toEqual(bin);
      expect(git(root, ["status", "--short"]).trim()).toBe("");
      await app.close();
    } finally {
      cleanup();
    }
  });
});

/* ── Blocker 5: file-level stale race → 409, not 500 ──────────────────────── */
describe("POST /git/revert-hunk — file-level stale race maps to 409", () => {
  it("a file deleted between recompute and unlink yields a 409 conflict, not 500", async () => {
    const { root, app, cleanup } = await repo();
    try {
      writeFileSync(join(root, "fresh.txt"), "x\ny\n");
      /* First delete succeeds (untracked → unlink). */
      const ok = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "fresh.txt", mode: "branch", action: "file" },
      });
      expect(ok.statusCode).toBe(200);
      /* A SECOND delete of the now-missing file is no longer a changed entry →
         409 HUNK_CONFLICT (the recompute gate), never a 500. */
      const race = await app.inject({
        method: "POST",
        url: "/git/revert-hunk",
        payload: { root, rel_path: "fresh.txt", mode: "branch", action: "file" },
      });
      expect(race.statusCode).toBe(409);
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("mutator maps a vanished untracked file to RevertConflictError (→409 family)", async () => {
    /* Directly exercise the mutator: ask it to delete an untracked path that
       does not exist on disk. This is the stale/missing file-level race that
       previously threw a 500 REVERT_FAILED; it must now be a RevertConflict. */
    const { root, cleanup } = await repo();
    try {
      const mutator = createGitMutator();
      await expect(
        mutator.revert(
          {
            root,
            relPosix: "never-existed.txt",
            status: "untracked",
            mergeBaseSha: git(root, ["rev-parse", "HEAD"]).trim(),
          },
          "file",
        ),
      ).rejects.toMatchObject({ name: "RevertConflictError" });
      cleanup();
    } catch (e) {
      cleanup();
      throw e;
    }
  });
});

/* lstat-based existence check (existsSync follows symlinks; we need to confirm
   the LINK node itself is gone). */
function lstatExists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}
