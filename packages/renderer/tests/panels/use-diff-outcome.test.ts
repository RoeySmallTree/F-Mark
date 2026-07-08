/* classifyDiffOutcome — the pure phase classifier behind useDiffOutcome that
   the FileViewer uses to decide: show the file + "No diff" chip, render the
   diff, or surface an unavailable/loading state. */

import { describe, it, expect } from "vitest";
import type { GitDiffResponse, GitFileActions, GitHunk } from "@f-mark/shared";
import { classifyDiffOutcome } from "../../src/panels/fileViewer/diff/useDiffOutcome.js";

const NO_ACTIONS: GitFileActions = { hunk: false, file: false, rename: false };

function resp(over: Partial<GitDiffResponse>): GitDiffResponse {
  return {
    status: "ok",
    rel_path: "a.txt",
    file_status: "modified",
    binary: false,
    base_ref: "main",
    merge_base_sha: "abc",
    hunks: [],
    actions: NO_ACTIONS,
    ...over,
  };
}

const HUNK: GitHunk = {
  id: "H0",
  header: "@@ -1 +1 @@",
  old_start: 1,
  old_lines: 1,
  new_start: 1,
  new_lines: 1,
  patch: "-a\n+b",
};

describe("classifyDiffOutcome", () => {
  it("maps not-git / base-not-found / not-found → unavailable", () => {
    expect(classifyDiffOutcome(resp({ status: "not-git" }))).toBe("unavailable");
    expect(classifyDiffOutcome(resp({ status: "base-not-found" }))).toBe(
      "unavailable",
    );
    expect(classifyDiffOutcome(resp({ status: "not-found" }))).toBe(
      "unavailable",
    );
  });

  it("maps an explicit no-change status → no-diff", () => {
    expect(classifyDiffOutcome(resp({ status: "no-change" }))).toBe("no-diff");
  });

  it("treats an ok file with hunks as changes", () => {
    expect(classifyDiffOutcome(resp({ status: "ok", hunks: [HUNK] }))).toBe(
      "changes",
    );
  });

  it("treats an ok file with 0 hunks and no actions as no-diff", () => {
    expect(classifyDiffOutcome(resp({ status: "ok", hunks: [] }))).toBe(
      "no-diff",
    );
  });

  it("treats a 0-hunk file with a file-level action as changes (e.g. binary modify)", () => {
    expect(
      classifyDiffOutcome(
        resp({
          status: "binary",
          binary: true,
          file_status: "binary-modified",
          hunks: [],
          actions: { hunk: false, file: true, rename: false },
        }),
      ),
    ).toBe("changes");
  });

  it("treats a metadata-only rename (0 hunks, rename action) as changes", () => {
    expect(
      classifyDiffOutcome(
        resp({
          status: "ok",
          file_status: "renamed",
          hunks: [],
          actions: { hunk: true, file: true, rename: true },
        }),
      ),
    ).toBe("changes");
  });

  it("treats a binary file with no actions as no-diff (defensive)", () => {
    expect(
      classifyDiffOutcome(
        resp({ status: "binary", binary: true, hunks: [], actions: NO_ACTIONS }),
      ),
    ).toBe("no-diff");
  });
});
