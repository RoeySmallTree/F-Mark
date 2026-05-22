import { describe, it, expect } from "vitest";
import { stat } from "node:fs/promises";
import { withTempProject } from "./tempdir.js";

describe("withTempProject", () => {
  it("creates a temp dir and cleans up", async () => {
    let captured: string | null = null;
    await withTempProject(async (root) => {
      captured = root;
      const s = await stat(root);
      expect(s.isDirectory()).toBe(true);
    });
    expect(captured).not.toBeNull();
    await expect(stat(captured!)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
