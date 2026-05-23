import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { findFmarkDir, loadHookContext } from "../../src/hooks/bootstrap.js";

describe("findFmarkDir", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "fm-"));
    await mkdir(join(root, "project", ".f-mark"), { recursive: true });
    await mkdir(join(root, "project", "src", "deeper"), { recursive: true });
  });

  it("finds .f-mark/ from a deeper subdir", async () => {
    expect(await findFmarkDir(join(root, "project", "src", "deeper"))).toBe(
      join(root, "project", ".f-mark"),
    );
  });

  it("finds .f-mark/ when cwd is the project root itself", async () => {
    expect(await findFmarkDir(join(root, "project"))).toBe(
      join(root, "project", ".f-mark"),
    );
  });

  it("returns null when no .f-mark exists above cwd", async () => {
    expect(await findFmarkDir(root)).toBeNull();
  });
});

describe("loadHookContext", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "fm-"));
    await mkdir(join(dir, ".f-mark"), { recursive: true });
    await writeFile(join(dir, ".f-mark", ".token"), "tok-abc\n", "utf8");
    await writeFile(
      join(dir, ".f-mark", "config.json"),
      JSON.stringify({ version: "0.1.0", port: 7780, participants: {} }),
      "utf8",
    );
  });

  it("returns kernel URL + token", async () => {
    const ctx = await loadHookContext(dir);
    expect(ctx).toMatchObject({
      fmarkDir: join(dir, ".f-mark"),
      kernelUrl: "http://localhost:7780",
      token: "tok-abc",
    });
  });
});
