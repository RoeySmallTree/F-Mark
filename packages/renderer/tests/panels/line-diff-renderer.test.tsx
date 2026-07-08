/* LineDiffRenderer — verifies expandHunk does NOT emit a phantom blank context
   row for the trailing split artifact and keeps old/new line numbers aligned
   (review §5). Real empty context lines (the standard " " prefix) survive. */

import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { GitDiffResponse } from "@f-mark/shared";

/* A fixed hunk whose patch ends WITHOUT a trailing empty line, but contains one
   real " " context line. The renderer is now fed this via the `diff` prop (the
   FileViewer resolves it once); no client fetch is mocked. */
const diffResponse: GitDiffResponse = {
  status: "ok",
  rel_path: "a.txt",
  file_status: "modified",
  binary: false,
  base_ref: "main",
  merge_base_sha: "abc",
  hunks: [
    {
      id: "H0",
      header: "@@ -1,3 +1,3 @@",
      old_start: 1,
      old_lines: 3,
      new_start: 1,
      new_lines: 3,
      /* " a", " " (real empty ctx), "-b", "+B", then a TRAILING empty split
         artifact ("") that must be SKIPPED (review §5) — not rendered as a
         5th ctx row, and not allowed to drift line numbers. */
      patch: " a\n \n-b\n+B\n",
    },
  ],
};

import { LineDiffRenderer } from "../../src/panels/fileViewer/diff/LineDiffRenderer.js";
import { FileScopeProvider } from "../../src/panels/fileViewer/fileScope.js";

afterEach(cleanup);

describe("LineDiffRenderer expandHunk", () => {
  it("renders no phantom blank row and keeps line numbers aligned", () => {
    render(
      <FileScopeProvider value={{ root: "/root", scope: { root: "/root" } }}>
        <LineDiffRenderer
          path="/root/a.txt"
          diff={diffResponse}
          wireMode="branch"
          style="inline"
          sessionId={null}
          onReverted={() => {}}
        />
      </FileScopeProvider>,
    );

    const body = screen.getByTestId("fv-line-diff-inline");
    const rows = body.querySelectorAll(".diff-line");
    /* 4 rows: ctx "a", ctx "" (real), del "b", add "B" — the trailing artifact
       would have added a 5th phantom ctx row. */
    expect(rows.length).toBe(4);

    /* The 2nd row is the REAL empty context line: ctx kind, both gutters set. */
    const second = rows[1]!;
    expect(second.className).toContain("ctx");
    const gutters = second.querySelectorAll(".diff-gutter");
    expect(gutters[0]?.textContent).toBe("2"); /* oldNo */
    expect(gutters[1]?.textContent).toBe("2"); /* newNo */

    /* The deletion's old line number is 3 (not drifted by a phantom row). */
    const del = body.querySelector(".diff-line.del")!;
    expect(del.querySelectorAll(".diff-gutter")[0]?.textContent).toBe("3");
  });
});
