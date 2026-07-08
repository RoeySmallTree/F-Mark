/* /git routes (design §8) — changed-files, diff, file-version, blob-version,
   diff-settings — exercised through the full server inject path against a
   fixture git repo, plus the session-touch filter for mode=session. */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { createSession } from "../../src/sessions.js";
import { listParticipants } from "../../src/participants.js";
import { writeEventFile } from "../../src/events/writer.js";

function git(root: string, args: string[]): void {
  execFileSync("git", ["-C", root, ...args], {
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "T",
      GIT_AUTHOR_EMAIL: "t@e",
      GIT_COMMITTER_NAME: "T",
      GIT_COMMITTER_EMAIL: "t@e",
    },
  });
}

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "fmark-gitr-"));
  const cfg = mkdtempSync(join(tmpdir(), "fmark-gitr-cfg-"));
  const p = paths(root);
  await initProject(p);
  git(root, ["init", "-q"]);
  git(root, ["checkout", "-q", "-b", "main"]);
  writeFileSync(join(root, "base.txt"), "a\nb\nc\n");
  writeFileSync(join(root, "other.txt"), "x\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "base"]);
  /* working-tree edits */
  writeFileSync(join(root, "base.txt"), "a\nB\nc\n");
  writeFileSync(join(root, "untracked.txt"), "fresh\n");

  const g = globalPaths(cfg);
  const ref = new PathContextRef({ global: g, active: activePaths(root) });
  const { app } = createServer({ token: null, paths: p, pathContextRef: ref });
  const cleanup = () => {
    rmSync(root, { recursive: true, force: true });
    rmSync(cfg, { recursive: true, force: true });
  };
  return { root, cfg, p, app, cleanup };
}

describe("GET /git/changed-files", () => {
  it("branch mode lists modified + untracked", async () => {
    const { root, app, cleanup } = await fixture();
    try {
      const res = await app.inject({
        method: "GET",
        url: `/git/changed-files?root=${encodeURIComponent(root)}&mode=branch`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("ok");
      const paths_ = body.files.map((f: { rel_path: string }) => f.rel_path);
      expect(paths_).toContain("base.txt");
      expect(paths_).toContain("untracked.txt");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("400 ROOT_SCOPE_REQUIRED without scope", async () => {
    const { app, cleanup } = await fixture();
    try {
      const res = await app.inject({ method: "GET", url: "/git/changed-files?mode=branch" });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe("ROOT_SCOPE_REQUIRED");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("not-git status for a non-git known root", async () => {
    const root = mkdtempSync(join(tmpdir(), "fmark-nogit-"));
    const cfg = mkdtempSync(join(tmpdir(), "fmark-nogit-cfg-"));
    try {
      const p = paths(root);
      await initProject(p);
      const g = globalPaths(cfg);
      const ref = new PathContextRef({ global: g, active: activePaths(root) });
      const { app } = createServer({ token: null, paths: p, pathContextRef: ref });
      const res = await app.inject({
        method: "GET",
        url: `/git/changed-files?root=${encodeURIComponent(root)}&mode=branch`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("not-git");
      await app.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(cfg, { recursive: true, force: true });
    }
  });

  it("session mode filters to tool-use-touched files", async () => {
    const { root, p, app, cleanup } = await fixture();
    try {
      const session = await createSession(p, { slug: "s" });
      const [pid] = Object.keys(await listParticipants(p));
      /* A Write tool-use touching base.txt (but NOT untracked.txt). */
      await writeEventFile(p, session.id, {
        kind: "tool-use",
        participant_id: pid!,
        ext: "json",
        contents: JSON.stringify({
          tool_name: "Write",
          tool_use_id: "t1",
          success: true,
          input: { file_path: join(root, "base.txt") },
        }),
      });
      const res = await app.inject({
        method: "GET",
        url: `/git/changed-files?root=${encodeURIComponent(root)}&mode=session&session_id=${session.id}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const paths_ = body.files.map((f: { rel_path: string }) => f.rel_path);
      expect(paths_).toContain("base.txt");
      expect(paths_).not.toContain("untracked.txt");
      await app.close();
    } finally {
      cleanup();
    }
  });
});

describe("GET /git/branches", () => {
  it("lists branch refs for the scoped root", async () => {
    const { root, app, cleanup } = await fixture();
    try {
      const res = await app.inject({
        method: "GET",
        url: `/git/branches?root=${encodeURIComponent(root)}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("ok");
      expect(body.current_ref).toBe("main");
      expect(body.refs).toContain("main");
      await app.close();
    } finally {
      cleanup();
    }
  });
});

describe("GET /git/diff", () => {
  it("returns parsed hunks for a modified file", async () => {
    const { root, app, cleanup } = await fixture();
    try {
      const res = await app.inject({
        method: "GET",
        url: `/git/diff?root=${encodeURIComponent(root)}&rel_path=base.txt&mode=branch`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("ok");
      expect(body.hunks.length).toBeGreaterThan(0);
      expect(body.hunks[0].patch).toContain("+B");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("synthesizes a new-file diff for an untracked file", async () => {
    const { root, app, cleanup } = await fixture();
    try {
      const res = await app.inject({
        method: "GET",
        url: `/git/diff?root=${encodeURIComponent(root)}&rel_path=untracked.txt&mode=branch`,
      });
      const body = res.json();
      expect(body.status).toBe("ok");
      expect(body.file_status).toBe("untracked");
      expect(body.hunks[0].patch).toContain("+fresh");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("403 for a path escaping the root", async () => {
    const { root, app, cleanup } = await fixture();
    try {
      const res = await app.inject({
        method: "GET",
        url: `/git/diff?root=${encodeURIComponent(root)}&rel_path=${encodeURIComponent("../escape.txt")}&mode=branch`,
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    } finally {
      cleanup();
    }
  });
});

describe("GET /git/file-version", () => {
  it("returns base + working text for a modified file", async () => {
    const { root, app, cleanup } = await fixture();
    try {
      const res = await app.inject({
        method: "GET",
        url: `/git/file-version?root=${encodeURIComponent(root)}&rel_path=base.txt&mode=branch`,
      });
      const body = res.json();
      expect(body.status).toBe("ok");
      expect(body.baseText).toBe("a\nb\nc\n");
      expect(body.workingText).toBe("a\nB\nc\n");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("empty base for an untracked file", async () => {
    const { root, app, cleanup } = await fixture();
    try {
      const res = await app.inject({
        method: "GET",
        url: `/git/file-version?root=${encodeURIComponent(root)}&rel_path=untracked.txt&mode=branch`,
      });
      const body = res.json();
      expect(body.baseText).toBe("");
      expect(body.workingText).toBe("fresh\n");
      await app.close();
    } finally {
      cleanup();
    }
  });
});

describe("GET/PUT /git/diff-settings", () => {
  it("reads detected base and persists/clears an override", async () => {
    const { root, p, app, cleanup } = await fixture();
    try {
      const pathId = (
        await import("../../src/paths/identity.js")
      ).computePathId(root);

      const read = await app.inject({
        method: "GET",
        url: `/git/diff-settings?path_id=${pathId}`,
      });
      expect(read.statusCode).toBe(200);
      expect(read.json().detected_base_ref).toBe("main");
      expect(read.json().diff_base_ref_override).toBeNull();

      const put = await app.inject({
        method: "PUT",
        url: "/git/diff-settings",
        payload: { path_id: pathId, diff_base_ref_override: "main" },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json().diff_base_ref_override).toBe("main");

      /* invalid ref rejected */
      const bad = await app.inject({
        method: "PUT",
        url: "/git/diff-settings",
        payload: { path_id: pathId, diff_base_ref_override: "no-such-ref-zzz" },
      });
      expect(bad.statusCode).toBe(400);

      /* clear */
      const clear = await app.inject({
        method: "PUT",
        url: "/git/diff-settings",
        payload: { path_id: pathId, diff_base_ref_override: null },
      });
      expect(clear.json().diff_base_ref_override).toBeNull();
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("rejects a non-empty override on a non-git root (review §9)", async () => {
    const root = mkdtempSync(join(tmpdir(), "fmark-nogit2-"));
    const cfg = mkdtempSync(join(tmpdir(), "fmark-nogit2-cfg-"));
    try {
      const p = paths(root);
      await initProject(p);
      const g = globalPaths(cfg);
      const ref = new PathContextRef({ global: g, active: activePaths(root) });
      const { app } = createServer({ token: null, paths: p, pathContextRef: ref });
      const pathId = (await import("../../src/paths/identity.js")).computePathId(root);
      const put = await app.inject({
        method: "PUT",
        url: "/git/diff-settings",
        payload: { path_id: pathId, diff_base_ref_override: "main" },
      });
      expect(put.statusCode).toBe(400);
      expect(put.json().code).toBe("NOT_A_GIT_WORKTREE");
      await app.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(cfg, { recursive: true, force: true });
    }
  });
});

describe("mode=session per-file filtering (review §2)", () => {
  it("/git/diff hides a file the session never touched", async () => {
    const { root, p, app, cleanup } = await fixture();
    try {
      const session = await createSession(p, { slug: "s" });
      const [pid] = Object.keys(await listParticipants(p));
      /* Touch base.txt only. */
      await writeEventFile(p, session.id, {
        kind: "tool-use",
        participant_id: pid!,
        ext: "json",
        contents: JSON.stringify({
          tool_name: "Write",
          tool_use_id: "t1",
          success: true,
          input: { file_path: join(root, "base.txt") },
        }),
      });
      /* base.txt → has hunks under session mode. */
      const touched = await app.inject({
        method: "GET",
        url: `/git/diff?root=${encodeURIComponent(root)}&rel_path=base.txt&mode=session&session_id=${session.id}`,
      });
      expect(touched.json().status).toBe("ok");
      expect(touched.json().hunks.length).toBeGreaterThan(0);
      /* untracked.txt → NOT touched → no-change under session mode. */
      const hidden = await app.inject({
        method: "GET",
        url: `/git/diff?root=${encodeURIComponent(root)}&rel_path=untracked.txt&mode=session&session_id=${session.id}`,
      });
      expect(hidden.json().status).toBe("no-change");
      expect(hidden.json().hunks).toEqual([]);
      /* But branch mode still shows the untracked file. */
      const branch = await app.inject({
        method: "GET",
        url: `/git/diff?root=${encodeURIComponent(root)}&rel_path=untracked.txt&mode=branch`,
      });
      expect(branch.json().status).toBe("ok");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("/git/diff returns no-change in session mode with no session id", async () => {
    const { root, app, cleanup } = await fixture();
    try {
      const res = await app.inject({
        method: "GET",
        url: `/git/diff?root=${encodeURIComponent(root)}&rel_path=base.txt&mode=session`,
      });
      expect(res.json().status).toBe("no-change");
      await app.close();
    } finally {
      cleanup();
    }
  });

  it("/git/file-version returns identical empty text for an untouched file", async () => {
    const { root, p, app, cleanup } = await fixture();
    try {
      const session = await createSession(p, { slug: "s" });
      const [pid] = Object.keys(await listParticipants(p));
      await writeEventFile(p, session.id, {
        kind: "tool-use",
        participant_id: pid!,
        ext: "json",
        contents: JSON.stringify({
          tool_name: "Write",
          tool_use_id: "t1",
          success: true,
          input: { file_path: join(root, "base.txt") },
        }),
      });
      /* untracked.txt not touched → empty identical text (no whole-branch leak). */
      const res = await app.inject({
        method: "GET",
        url: `/git/file-version?root=${encodeURIComponent(root)}&rel_path=untracked.txt&mode=session&session_id=${session.id}`,
      });
      const body = res.json();
      expect(body.status).toBe("ok");
      expect(body.baseText).toBe("");
      expect(body.workingText).toBe("");
      /* base.txt IS touched → working text present. */
      const touched = await app.inject({
        method: "GET",
        url: `/git/file-version?root=${encodeURIComponent(root)}&rel_path=base.txt&mode=session&session_id=${session.id}`,
      });
      expect(touched.json().workingText).toBe("a\nB\nc\n");
      await app.close();
    } finally {
      cleanup();
    }
  });
});

describe("symlink-escape rejection (review §1)", () => {
  it("does not follow an in-repo symlink that escapes the root", async () => {
    const root = mkdtempSync(join(tmpdir(), "fmark-symr-"));
    const cfg = mkdtempSync(join(tmpdir(), "fmark-symr-cfg-"));
    const outside = mkdtempSync(join(tmpdir(), "fmark-secret-"));
    try {
      writeFileSync(join(outside, "secret.txt"), "TOP SECRET\n");
      const p = paths(root);
      await initProject(p);
      git(root, ["init", "-q"]);
      git(root, ["checkout", "-q", "-b", "main"]);
      writeFileSync(join(root, "real.txt"), "x\n");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-q", "-m", "base"]);
      /* An UNTRACKED symlink pointing outside the root. */
      symlinkSync(join(outside, "secret.txt"), join(root, "leak.txt"));

      const g = globalPaths(cfg);
      const ref = new PathContextRef({ global: g, active: activePaths(root) });
      const { app } = createServer({ token: null, paths: p, pathContextRef: ref });

      /* /git/diff for the untracked symlink must NOT render the target bytes. */
      const diff = await app.inject({
        method: "GET",
        url: `/git/diff?root=${encodeURIComponent(root)}&rel_path=leak.txt&mode=branch`,
      });
      const body = diff.json();
      const allHunks = JSON.stringify(body.hunks ?? []);
      expect(allHunks).not.toContain("TOP SECRET");
      expect(body.binary).toBe(true);

      /* /git/file-version must not leak target bytes either. */
      const fv = await app.inject({
        method: "GET",
        url: `/git/file-version?root=${encodeURIComponent(root)}&rel_path=leak.txt&mode=branch`,
      });
      expect(fv.json().workingText ?? "").not.toContain("TOP SECRET");

      /* /git/blob-version working side → 403 (escapes root). */
      const blob = await app.inject({
        method: "GET",
        url: `/git/blob-version?root=${encodeURIComponent(root)}&rel_path=leak.txt&version=working&mode=branch`,
      });
      expect(blob.statusCode).toBe(403);
      await app.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(cfg, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("GET /git/blob-version Range (review §4)", () => {
  it("serves a byte range of the working file with 206 + Content-Range", async () => {
    const root = mkdtempSync(join(tmpdir(), "fmark-blobr-"));
    const cfg = mkdtempSync(join(tmpdir(), "fmark-blobr-cfg-"));
    try {
      const p = paths(root);
      await initProject(p);
      git(root, ["init", "-q"]);
      git(root, ["checkout", "-q", "-b", "main"]);
      writeFileSync(join(root, "data.bin"), "0123456789");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-q", "-m", "base"]);
      writeFileSync(join(root, "data.bin"), "ABCDEFGHIJ");

      const g = globalPaths(cfg);
      const ref = new PathContextRef({ global: g, active: activePaths(root) });
      const { app } = createServer({ token: null, paths: p, pathContextRef: ref });

      const res = await app.inject({
        method: "GET",
        url: `/git/blob-version?root=${encodeURIComponent(root)}&rel_path=data.bin&version=working&mode=branch`,
        headers: { range: "bytes=2-5" },
      });
      expect(res.statusCode).toBe(206);
      expect(res.headers["content-range"]).toBe("bytes 2-5/10");
      expect(res.body).toBe("CDEF");

      /* Base side range, streamed via git cat-file (no full buffer). */
      const baseRes = await app.inject({
        method: "GET",
        url: `/git/blob-version?root=${encodeURIComponent(root)}&rel_path=data.bin&version=base&mode=branch`,
        headers: { range: "bytes=0-3" },
      });
      expect(baseRes.statusCode).toBe(206);
      expect(baseRes.body).toBe("0123");
      await app.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(cfg, { recursive: true, force: true });
    }
  });
});

describe("unsafe base ref rejection (review nit 10)", () => {
  it("rejects a leading-dash / --output= base with 400 before git runs", async () => {
    const { root, app, cleanup } = await fixture();
    try {
      /* A leading-dash base — would be parsed as a git option if it reached the
         argv. Must be a 400, NOT a silent base-not-found, on every ref-bearing
         endpoint. */
      for (const ep of ["changed-files", "diff", "file-version", "blob-version"]) {
        const dash = await app.inject({
          method: "GET",
          url: `/git/${ep}?root=${encodeURIComponent(root)}&rel_path=base.txt&base=${encodeURIComponent("-rf")}&mode=branch`,
        });
        expect(dash.statusCode).toBe(400);
        expect(dash.json().code).toBe("INVALID_BASE_REF");

        const out = await app.inject({
          method: "GET",
          url: `/git/${ep}?root=${encodeURIComponent(root)}&rel_path=base.txt&base=${encodeURIComponent("--output=/tmp/pwn")}&mode=branch`,
        });
        expect(out.statusCode).toBe(400);
        expect(out.json().code).toBe("INVALID_BASE_REF");
      }

      /* A safe (but non-existent) base ref is NOT a 400 — it resolves to
         base-not-found, proving only unsafe refs are pre-rejected. */
      const safe = await app.inject({
        method: "GET",
        url: `/git/changed-files?root=${encodeURIComponent(root)}&base=no-such-ref-xyz&mode=branch`,
      });
      expect(safe.statusCode).toBe(200);
      expect(safe.json().status).toBe("base-not-found");
      await app.close();
    } finally {
      cleanup();
    }
  });
});
