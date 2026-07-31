import { describe, it, expect } from "vitest";
import { fileActionLabel, hunkActionLabel, revertConfirmDetail } from "./model";

describe("hunkActionLabel", () => {
  it("says Delete for an untracked file", () => {
    expect(hunkActionLabel("untracked")).toBe("Delete hunk");
  });

  it("says Restore for a deleted file", () => {
    expect(hunkActionLabel("deleted")).toBe("Restore hunk");
  });

  it("says Revert for a modified file", () => {
    expect(hunkActionLabel("modified")).toBe("Revert hunk");
  });
});

describe("fileActionLabel", () => {
  it("agrees with hunkActionLabel about untracked files", () => {
    expect(fileActionLabel("untracked")).toBe("Delete file");
  });
});

describe("revertConfirmDetail", () => {
  it("warns that untracked content is unrecoverable", () => {
    expect(revertConfirmDetail("untracked")).toContain("permanent");
  });

  it("does not over-warn for a tracked file", () => {
    expect(revertConfirmDetail("modified")).not.toContain("permanent");
  });
});
