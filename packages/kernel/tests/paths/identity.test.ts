import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computePathId } from "../../src/paths/identity.js";

describe("computePathId", () => {
  let scratch: string;

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), "fmark-pathid-"));
  });

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("returns a 12-char hex string", () => {
    const id = computePathId(scratch);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  it("returns the same id for the same canonical path", () => {
    const a = computePathId(scratch);
    const b = computePathId(scratch);
    expect(a).toBe(b);
  });

  it("returns the same id for a path and its symlink", () => {
    const target = join(scratch, "real");
    mkdirSync(target);
    const link = join(scratch, "alias");
    symlinkSync(target, link);
    expect(computePathId(target)).toBe(computePathId(link));
  });

  it("returns different ids for different paths", () => {
    const a = join(scratch, "left");
    const b = join(scratch, "right");
    mkdirSync(a);
    mkdirSync(b);
    expect(computePathId(a)).not.toBe(computePathId(b));
  });

  it("falls back to the input string when the path does not exist", () => {
    const ghost = join(scratch, "does-not-exist-yet");
    const id = computePathId(ghost);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });
});
