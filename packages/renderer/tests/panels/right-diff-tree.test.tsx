import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GitChangedFile } from "@f-mark/shared";
import type { FilesTreeResponse } from "../../src/api/client.js";
import { RightDiffTree } from "../../src/panels/right/RightDiffTree.js";
import { useStore } from "../../src/state/store.js";
import { FileDisplaySurfaceProvider } from "../../src/shell/fileDisplaySurface.js";
import { jsonResponse } from "../cards/_helpers.js";

const ROOT = "/workspace/project";
const PATH_ID = "project-id";
const SESSION_ID = "session-1";

const TREE: FilesTreeResponse = {
  root: ROOT,
  entries: [
    {
      index: 0,
      parent: null,
      name: "src",
      relPath: "src",
      isDir: true,
      isSymlink: false,
      ext: null,
      size: null,
      mtimeMs: 1,
      ignored: false,
      depth: 0,
    },
    {
      index: 1,
      parent: 0,
      name: "changed.ts",
      relPath: "src/changed.ts",
      isDir: false,
      isSymlink: false,
      ext: "ts",
      size: 12,
      mtimeMs: 1,
      ignored: false,
      depth: 1,
    },
    {
      index: 2,
      parent: 0,
      name: "quiet.ts",
      relPath: "src/quiet.ts",
      isDir: false,
      isSymlink: false,
      ext: "ts",
      size: 12,
      mtimeMs: 1,
      ignored: false,
      depth: 1,
    },
  ],
  truncated: false,
  truncatedAt: 3,
};

const CHANGED: GitChangedFile = {
  rel_path: "src/changed.ts",
  status: "modified",
  additions: 1,
  deletions: 1,
  binary: false,
  actions: { hunk: true, file: true, rename: false },
};

function resetStore(): void {
  useStore.setState({
    token: null,
    currentSessionId: SESSION_ID,
    activePath: ROOT,
    activePathId: PATH_ID,
    selectedPath: null,
    selectedPathId: null,
    rightTab: "log",
    rightTabBySession: {},
    fileViewerDiffBySession: {},
    filesTreeByPath: { [ROOT]: TREE },
    filesTreeLoadingByPath: {},
    openFile: vi.fn(),
  });
}

describe("RightDiffTree", () => {
  beforeEach(() => {
    resetStore();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo) => {
        const url = String(input);
        if (url.startsWith("/git/branches")) {
          return Promise.resolve(
            jsonResponse({
              status: "ok",
              path_id: PATH_ID,
              root: ROOT,
              current_ref: "feature",
              detected_base_ref: "main",
              refs: ["feature", "main"],
            }),
          );
        }
        if (url.startsWith("/git/changed-files")) {
          return Promise.resolve(
            jsonResponse({
              status: "ok",
              path_id: PATH_ID,
              base_ref: "main",
              merge_base_sha: "abc",
              files: [CHANGED],
            }),
          );
        }
        return Promise.resolve(jsonResponse({}));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("shows only changed files and opens them in the selected diff mode", async () => {
    const user = userEvent.setup();
    render(
      <FileDisplaySurfaceProvider value={() => undefined}>
        <RightDiffTree />
      </FileDisplaySurfaceProvider>,
    );

    expect(await screen.findByText("changed.ts")).toBeInTheDocument();
    expect(screen.queryByText("quiet.ts")).toBeNull();

    await user.click(screen.getByRole("tab", { name: /this branch/i }));
    await waitFor(() =>
      expect(screen.getByLabelText("Compare branch")).toHaveValue("feature"),
    );
    await user.selectOptions(screen.getByLabelText("Compare branch"), "main");
    await user.click(screen.getByText("changed.ts"));

    expect(useStore.getState().openFile).toHaveBeenCalledWith(
      `${ROOT}/src/changed.ts`,
    );
    expect(
      useStore.getState().fileViewerDiffBySession[SESSION_ID]?.[
        `${ROOT}/src/changed.ts`
      ],
    ).toMatchObject({
      mode: "whole-branch",
      baseRef: "main",
    });
  });
});
