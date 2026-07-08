/* ChangedAbsentFiles opens the right path for absent changed entries
   (round-2 review issue #6):
   - a renamed file's OLD path (absent from the tree) opens the NEW path so the
     diff/media endpoints read the present NEW working side (old_path is paired
     for the base read);
   - a deleted file opens its own (absent) path. */

import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangedAbsentFiles } from "../../src/panels/right/files/ChangedAbsentFiles.js";
import { useStore } from "../../src/state/store.js";
import type { FilesTreeResponse } from "../../src/api/client.js";

const ROOT = "/ws/proj";
const PATH_ID = "proj-id";

function treeWith(presentRel: string): FilesTreeResponse {
  return {
    root: ROOT,
    entries: [
      {
        index: 0,
        parent: null,
        name: presentRel,
        relPath: presentRel,
        isDir: false,
        isSymlink: false,
        ext: "",
        size: 1,
        mtimeMs: 1,
        ignored: false,
        depth: 0,
      },
    ],
    truncated: false,
    truncatedAt: 0,
  };
}

afterEach(() => {
  cleanup();
  useStore.setState({
    activePath: null,
    activePathId: null,
    filesTreeByPath: {},
    gitChangedByPathId: {},
    gitRenamesByPathId: {},
  });
});

describe("ChangedAbsentFiles (round-2 #6)", () => {
  it("opens the NEW path when a renamed OLD path row is clicked", async () => {
    const openFile = vi.fn();
    useStore.setState({
      activePath: ROOT,
      activePathId: PATH_ID,
      /* NEW path present in the tree; OLD path is absent. */
      filesTreeByPath: { [ROOT]: treeWith("new/name.ts") },
      gitChangedByPathId: {
        [PATH_ID]: { "new/name.ts": "renamed", "old/name.ts": "renamed" },
      },
      gitRenamesByPathId: { [PATH_ID]: { "old/name.ts": "new/name.ts" } },
      openFile,
    });

    render(<ChangedAbsentFiles />);
    /* Only the OLD path surfaces (NEW path lives in the tree). */
    const row = screen.getByText("old/name.ts");
    await userEvent.click(row);
    /* It opens the NEW absolute path, not the absent OLD one. */
    expect(openFile).toHaveBeenCalledWith(`${ROOT}/new/name.ts`);
    expect(openFile).not.toHaveBeenCalledWith(`${ROOT}/old/name.ts`);
  });

  it("opens the OLD (absent) path for a deleted file", async () => {
    const openFile = vi.fn();
    useStore.setState({
      activePath: ROOT,
      activePathId: PATH_ID,
      filesTreeByPath: { [ROOT]: treeWith("kept.ts") },
      gitChangedByPathId: { [PATH_ID]: { "gone.ts": "deleted" } },
      gitRenamesByPathId: { [PATH_ID]: {} },
      openFile,
    });

    render(<ChangedAbsentFiles />);
    await userEvent.click(screen.getByText("gone.ts"));
    expect(openFile).toHaveBeenCalledWith(`${ROOT}/gone.ts`);
  });
});
