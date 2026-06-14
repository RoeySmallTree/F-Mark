import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureFmarkGitignored } from "../src/gitignore.js";

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fmark-gi-"));
  await mkdir(join(root, ".git"));
  return root;
}

describe("ensureFmarkGitignored", () => {
  it("does nothing when no .gitignore exists anywhere up to git root", async () => {
    const root = await makeRepo();
    await ensureFmarkGitignored(root);
    // Should not have created one.
    await expect(readFile(join(root, ".gitignore"), "utf8")).rejects.toThrow();
  });

  it("does nothing when path is outside any git repo", async () => {
    // No .git anywhere — walking up shouldn't write to ambient parent files.
    const root = await mkdtemp(join(tmpdir(), "fmark-gi-no-repo-"));
    await ensureFmarkGitignored(root);
    await expect(readFile(join(root, ".gitignore"), "utf8")).rejects.toThrow();
  });

  it("appends .f-mark/ to an existing .gitignore at the same dir", async () => {
    const root = await makeRepo();
    await writeFile(join(root, ".gitignore"), "node_modules\ndist\n");
    await ensureFmarkGitignored(root);
    const after = await readFile(join(root, ".gitignore"), "utf8");
    expect(after).toContain("node_modules");
    expect(after).toContain(".f-mark/");
  });

  it("is idempotent: skips when .f-mark/ already present", async () => {
    const root = await makeRepo();
    const before = "node_modules\n.f-mark/\n";
    await writeFile(join(root, ".gitignore"), before);
    await ensureFmarkGitignored(root);
    const after = await readFile(join(root, ".gitignore"), "utf8");
    expect(after).toBe(before);
  });

  it("treats .f-mark (no trailing slash) and /.f-mark as already-ignored", async () => {
    const root = await makeRepo();
    await writeFile(join(root, ".gitignore"), ".f-mark\n");
    await ensureFmarkGitignored(root);
    expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(".f-mark\n");

    const root2 = await makeRepo();
    await writeFile(join(root2, ".gitignore"), "/.f-mark/\n");
    await ensureFmarkGitignored(root2);
    expect(await readFile(join(root2, ".gitignore"), "utf8")).toBe("/.f-mark/\n");
  });

  it("writes the subdir-relative entry when .gitignore lives at the git root", async () => {
    const repo = await makeRepo();
    await writeFile(join(repo, ".gitignore"), "node_modules\n");
    const sub = join(repo, "packages", "demo");
    await mkdir(sub, { recursive: true });
    await ensureFmarkGitignored(sub);
    const after = await readFile(join(repo, ".gitignore"), "utf8");
    expect(after).toContain("packages/demo/.f-mark/");
  });

  it("appends a newline before the entry when the file lacks a trailing newline", async () => {
    const root = await makeRepo();
    await writeFile(join(root, ".gitignore"), "dist");
    await ensureFmarkGitignored(root);
    const after = await readFile(join(root, ".gitignore"), "utf8");
    expect(after.startsWith("dist\n")).toBe(true);
    expect(after).toMatch(/\.f-mark\/\s*$/);
  });
});
