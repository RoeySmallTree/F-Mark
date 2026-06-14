import { describe, it, expect } from "vitest";
import { chmod, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { paths } from "../src/paths.js";
import {
  deleteTokenFile,
  ensureGitignoreEntry,
  ensureProjectAuth,
  generateToken,
  readExistingToken,
  resolveBootToken,
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

describe("resolveBootToken (stable token across restarts)", () => {
  it("readExistingToken returns null when absent and the value when present", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await mkdir(p.fmarkDir(), { recursive: true });
      expect(await readExistingToken(p)).toBeNull();
      await writeTokenFile(p, "persisted-tok");
      expect(await readExistingToken(p)).toBe("persisted-tok");
    });
  });

  it("generates a fresh token when no file exists, marked generated", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await mkdir(p.fmarkDir(), { recursive: true });
      const r = await resolveBootToken(p, { noAuth: false });
      expect(r.token).toMatch(/^[0-9a-f]{32}$/);
      expect(r.generated).toBe(true);
    });
  });

  it("reuses an existing token (not generated)", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await mkdir(p.fmarkDir(), { recursive: true });
      await writeTokenFile(p, "persisted-tok");
      const r = await resolveBootToken(p, { noAuth: false });
      expect(r.token).toBe("persisted-tok");
      expect(r.generated).toBe(false);
    });
  });

  it("two sequential boots keep the SAME token (regression: 401 after restart)", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await mkdir(p.fmarkDir(), { recursive: true });
      const first = await resolveBootToken(p, { noAuth: false });
      await ensureProjectAuth(p, first.token);
      const second = await resolveBootToken(p, { noAuth: false });
      expect(second.token).toBe(first.token);
      expect(second.generated).toBe(false);
    });
  });

  it("--password overrides an existing file and is not 'generated'", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await mkdir(p.fmarkDir(), { recursive: true });
      await writeTokenFile(p, "persisted-tok");
      const r = await resolveBootToken(p, { noAuth: false, password: "pw" });
      expect(r.token).toBe("pw");
      expect(r.generated).toBe(false);
    });
  });

  it("--no-auth yields a null token", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      const r = await resolveBootToken(p, { noAuth: true });
      expect(r.token).toBeNull();
      expect(r.generated).toBe(false);
    });
  });

  it("writeTokenFile reasserts 0600 on a pre-existing loose-perm file", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await mkdir(p.fmarkDir(), { recursive: true });
      await writeFile(p.tokenFile(), "old");
      await chmod(p.tokenFile(), 0o644);
      await writeTokenFile(p, "new");
      const s = await stat(p.tokenFile());
      expect(s.mode & 0o777).toBe(0o600);
      expect(await readFile(p.tokenFile(), "utf8")).toBe("new");
    });
  });

  it("concurrent cold boots converge on ONE token (atomic create)", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await mkdir(p.fmarkDir(), { recursive: true });
      const results = await Promise.all([
        resolveBootToken(p, { noAuth: false }),
        resolveBootToken(p, { noAuth: false }),
        resolveBootToken(p, { noAuth: false }),
      ]);
      const tokens = new Set(results.map((r) => r.token));
      expect(tokens.size).toBe(1);
      // exactly one boot owns generation; the rest adopt the winner's token
      expect(results.filter((r) => r.generated).length).toBe(1);
      expect(await readExistingToken(p)).toBe(results[0].token);
    });
  });
});
