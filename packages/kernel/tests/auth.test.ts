import { describe, it, expect } from "vitest";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { paths } from "../src/paths.js";
import {
  deleteTokenFile,
  ensureGitignoreEntry,
  generateToken,
  writeTokenFile,
} from "../src/auth.js";
import { withTempProject } from "./helpers/tempdir.js";

describe("auth", () => {
  it("generateToken returns 32 hex chars", () => {
    expect(generateToken()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("writeTokenFile then deleteTokenFile", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await mkdir(p.fmarkDir(), { recursive: true });
      await writeTokenFile(p, "tok123");
      expect(await readFile(p.tokenFile(), "utf8")).toBe("tok123");
      const s = await stat(p.tokenFile());
      expect((s.mode & 0o777)).toBe(0o600);
      await deleteTokenFile(p);
      await expect(stat(p.tokenFile())).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("ensureGitignoreEntry appends when missing", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await ensureGitignoreEntry(p);
      const txt = await readFile(join(root, ".gitignore"), "utf8");
      expect(txt).toContain(".f-mark/.token");
    });
  });

  it("ensureGitignoreEntry is idempotent", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await writeFile(join(root, ".gitignore"), ".f-mark/.token\n");
      await ensureGitignoreEntry(p);
      const txt = await readFile(join(root, ".gitignore"), "utf8");
      expect(txt.match(/\.f-mark\/\.token/g)!.length).toBe(1);
    });
  });
});
