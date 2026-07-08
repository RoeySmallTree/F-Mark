/* Should-fix 6 — the FILE-LEVEL action strip in the line-diff UI.

   Verifies the strip is rendered at the diff header INDEPENDENT of per-hunk
   actions:
   - a PURE RENAME (0 hunks) shows the strip with "Undo rename" + "Restore
     file" instead of the old "No changes" dead end (Undo rename was
     unreachable before);
   - a file WITH hunks shows the strip AND per-hunk Comment/Revert, and the
     whole-file/rename actions are NOT duplicated onto each hunk bar. */

import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { GitDiffResponse } from "@f-mark/shared";

import { LineDiffRenderer } from "../../src/panels/fileViewer/diff/LineDiffRenderer.js";
import { FileScopeProvider } from "../../src/panels/fileViewer/fileScope.js";

afterEach(cleanup);

/* The FileViewer resolves the diff once and feeds it in as a prop — the
   renderer no longer fetches, so each test passes its own response directly. */
function renderDiff(diff: GitDiffResponse): void {
  render(
    <FileScopeProvider value={{ root: "/root", scope: { root: "/root" } }}>
      <LineDiffRenderer
        path="/root/a.txt"
        diff={diff}
        wireMode="branch"
        style="inline"
        sessionId={null}
        onReverted={() => {}}
      />
    </FileScopeProvider>,
  );
}

describe("LineDiffRenderer — file-level action strip", () => {
  it("renders the strip with Undo rename + Restore file for a PURE RENAME (0 hunks)", () => {
    renderDiff({
      status: "ok",
      rel_path: "new.txt",
      old_path: "old.txt",
      file_status: "renamed",
      binary: false,
      base_ref: "main",
      merge_base_sha: "abc",
      hunks: [],
      actions: { hunk: true, file: true, rename: true },
    });

    expect(screen.getByTestId("fv-file-actions")).toBeTruthy();
    /* The old behavior short-circuited to "No changes" with NO action strip. */
    expect(screen.getByTestId("fv-hunk-rename-revert").textContent).toMatch(
      /Undo rename/,
    );
    expect(screen.getByTestId("fv-hunk-file-revert").textContent).toMatch(
      /Restore file/,
    );
    /* The header surfaces the old path so a metadata-only rename reads clearly. */
    expect(screen.getByTestId("fv-file-actions").textContent).toMatch(
      /Renamed from old\.txt/,
    );
  });

  it("renders the strip AND per-hunk bars for a file WITH hunks, without duplicating file actions", () => {
    renderDiff({
      status: "ok",
      rel_path: "a.txt",
      file_status: "modified",
      binary: false,
      base_ref: "main",
      merge_base_sha: "abc",
      hunks: [
        {
          id: "H0",
          header: "@@ -1,2 +1,2 @@",
          old_start: 1,
          old_lines: 2,
          new_start: 1,
          new_lines: 2,
          patch: " a\n-b\n+B",
        },
      ],
      actions: { hunk: true, file: true, rename: false },
    });

    expect(screen.getByTestId("fv-file-actions")).toBeTruthy();
    /* The file strip exposes the whole-file action exactly ONCE. */
    expect(screen.getAllByTestId("fv-hunk-file-revert")).toHaveLength(1);
    /* Per-hunk Comment + Revert are present on the hunk. */
    expect(screen.getByTestId("fv-hunk-comment")).toBeTruthy();
    expect(screen.getByTestId("fv-hunk-revert").textContent).toMatch(/Revert hunk/);
  });

  it("a DELETED file with hunks: strip says Restore file, per-hunk says Restore hunk", () => {
    renderDiff({
      status: "ok",
      rel_path: "gone.txt",
      file_status: "deleted",
      binary: false,
      base_ref: "main",
      merge_base_sha: "abc",
      hunks: [
        {
          id: "H0",
          header: "@@ -1,2 +0,0 @@",
          old_start: 1,
          old_lines: 2,
          new_start: 0,
          new_lines: 0,
          patch: "-a\n-b",
        },
      ],
      actions: { hunk: true, file: true, rename: false },
    });

    expect(screen.getByTestId("fv-file-actions")).toBeTruthy();
    expect(screen.getByTestId("fv-hunk-file-revert").textContent).toMatch(/Restore file/);
    expect(screen.getByTestId("fv-hunk-revert").textContent).toMatch(/Restore hunk/);
  });

  it("renders NO strip when the status permits no file/rename action (defensive)", () => {
    /* A 0-hunk, no-action diff would be classified "no-diff" upstream (the
       FileViewer shows the plain file + the "No diff" chip), so the renderer
       isn't mounted for it in practice. Rendered directly it degrades to the
       inline "no textual changes" note with NO action strip. */
    renderDiff({
      status: "ok",
      rel_path: "a.txt",
      file_status: "modified",
      binary: false,
      base_ref: "main",
      merge_base_sha: "abc",
      hunks: [],
      actions: { hunk: false, file: false, rename: false },
    });

    expect(screen.getByText(/No textual changes in this file/)).toBeTruthy();
    expect(screen.queryByTestId("fv-file-actions")).toBeNull();
  });
});
