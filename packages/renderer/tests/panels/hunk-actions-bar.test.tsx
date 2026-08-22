/* Phase 5 — per-hunk actions (HunkActionsBar).

   Covers the two diff-renderer-agnostic behaviors:
   - Comment-on-hunk posts a `file-comment` prose carrying file_path + the
     hunk's NEW-range `lines` + `diff_hunk` (the hunk patch) + `diff_base` (the
     active mode) — "append the diff + comment to the conversation" (§9.1).
   - Revert hunk → POST /git/revert-hunk; a 409 HUNK_CONFLICT renders an inline
     "refresh" message and does NOT call onReverted (no diff refresh / no
     corruption). */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GitFileActions, GitFileStatus, GitHunk } from "@f-mark/shared";
import { useStore } from "../../src/state/store.js";
import { HunkActionsBar } from "../../src/panels/fileViewer/diff/HunkActionsBar.js";
import { FileScopeProvider } from "../../src/panels/fileViewer/fileScope.js";
import { PARTICIPANTS, SESSION_META, jsonResponse } from "../cards/_helpers.js";

const ROOT = "/project";

const HUNK: GitHunk = {
  id: "H1",
  header: "@@ -10,3 +10,4 @@ fn",
  old_start: 10,
  old_lines: 3,
  new_start: 10,
  new_lines: 4,
  patch: " ctx\n-old line\n+new line\n+added line\n ctx2",
};

function resetStore(): void {
  useStore.setState({
    token: "tok",
    sessions: [{ ...SESSION_META, path: ROOT, path_id: "project-id" }],
    currentSessionId: SESSION_META.id,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: [],
    activePath: ROOT,
    activePathId: "project-id",
    commentTarget: null,
    rightTab: "log",
  });
}

function renderBar(onReverted = vi.fn()): { onReverted: ReturnType<typeof vi.fn> } {
  render(
    <FileScopeProvider value={{ root: ROOT, scope: { pathId: "project-id" } }}>
      <HunkActionsBar
        absPath={`${ROOT}/src/a.ts`}
        relPath="src/a.ts"
        scope={{ pathId: "project-id" }}
        wireMode="branch"
        diffBase="whole-branch"
        fileStatus="modified"
        actions={{ hunk: true, file: true, rename: false }}
        hunk={HUNK}
        sessionId={SESSION_META.id}
        onReverted={onReverted}
      />
    </FileScopeProvider>,
  );
  return { onReverted };
}

describe("HunkActionsBar — comment on hunk", () => {
  beforeEach(() => resetStore());
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("posts file_path + hunk new-range lines + diff_hunk + diff_base", async () => {
    const user = userEvent.setup();
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/events/prose") && init?.method === "POST") {
        calls.push({ url: u, body: JSON.parse(init.body as string) });
        return Promise.resolve(jsonResponse({ filename: "20260614T120000Z_us-a7f3.prose.md" }));
      }
      if (u.includes("/events")) return Promise.resolve(jsonResponse({ events: [] }));
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderBar();

    /* Open the comment draft, type, submit. */
    await user.click(screen.getByTestId("fv-hunk-comment"));
    const textarea = await screen.findByRole("textbox");
    await user.type(textarea, "please revisit this");
    /* The popover's submit button is labelled "Comment". */
    const submit = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.trim() === "Comment" && b !== screen.getByTestId("fv-hunk-comment"));
    expect(submit).toBeTruthy();
    await user.click(submit!);

    await waitFor(() => expect(calls.length).toBe(1));
    const body = calls[0]!.body;
    expect(body.file_path).toBe("src/a.ts");
    /* The hunk's NEW range is [new_start, new_start + new_lines - 1] = [10,13]. */
    expect(body.lines).toEqual([10, 13]);
    /* diff_hunk = header + "\n" + patch (the full hunk text). */
    expect(body.diff_hunk).toBe(`${HUNK.header}\n${HUNK.patch}`);
    expect(body.diff_base).toBe("whole-branch");
  });
});

describe("HunkActionsBar — revert conflict UI", () => {
  beforeEach(() => {
    resetStore();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    cleanup();
  });

  test("409 HUNK_CONFLICT shows an inline refresh message and does not refresh", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/git/revert-hunk") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(
            { code: "HUNK_CONFLICT", message: "hunk no longer applies — refresh the diff" },
            409,
          ),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onReverted } = renderBar();

    await user.click(screen.getByTestId("fv-hunk-revert"));

    await waitFor(() => {
      expect(screen.getByTestId("fv-hunk-conflict")).toBeTruthy();
    });
    expect(screen.getByTestId("fv-hunk-conflict").textContent).toMatch(/refresh/i);
    /* A conflict must NOT trigger a diff refresh (no corruption / no re-fetch). */
    expect(onReverted).not.toHaveBeenCalled();
  });

  test("successful revert calls onReverted (diff re-fetch)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/git/revert-hunk") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({ status: "ok", action: "hunk", rel_path: "src/a.ts", file_status: "modified" }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onReverted } = renderBar();
    await user.click(screen.getByTestId("fv-hunk-revert"));
    await waitFor(() => expect(onReverted).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("fv-hunk-conflict")).toBeNull();
  });
});

/* Generic render helper for label / file-strip assertions. */
function renderWith(props: {
  fileStatus: GitFileStatus;
  actions: GitFileActions;
  hunk?: GitHunk;
  fileLevelOnly?: boolean;
  hideFileAction?: boolean;
  oldPath?: string;
}): void {
  render(
    <FileScopeProvider value={{ root: ROOT, scope: { pathId: "project-id" } }}>
      <HunkActionsBar
        absPath={`${ROOT}/src/a.ts`}
        relPath="src/a.ts"
        scope={{ pathId: "project-id" }}
        wireMode="branch"
        diffBase="whole-branch"
        fileStatus={props.fileStatus}
        actions={props.actions}
        {...(props.hunk !== undefined ? { hunk: props.hunk } : {})}
        {...(props.oldPath !== undefined ? { oldPath: props.oldPath } : {})}
        {...(props.fileLevelOnly ? { fileLevelOnly: true } : {})}
        {...(props.hideFileAction ? { hideFileAction: true } : {})}
        sessionId={SESSION_META.id}
        onReverted={vi.fn()}
      />
    </FileScopeProvider>,
  );
}

describe("HunkActionsBar — per-hunk label by status (should-fix 7)", () => {
  beforeEach(() => resetStore());
  afterEach(cleanup);

  test("deleted file → the per-hunk revert reads 'Restore hunk'", () => {
    renderWith({
      fileStatus: "deleted",
      actions: { hunk: true, file: true, rename: false },
      hunk: HUNK,
      hideFileAction: true,
    });
    expect(screen.getByTestId("fv-hunk-revert").textContent).toMatch(/Restore hunk/);
    expect(screen.getByTestId("fv-hunk-revert").textContent).not.toMatch(/Revert hunk/);
  });

  test("modified file → the per-hunk revert reads 'Revert hunk'", () => {
    renderWith({
      fileStatus: "modified",
      actions: { hunk: true, file: true, rename: false },
      hunk: HUNK,
      hideFileAction: true,
    });
    expect(screen.getByTestId("fv-hunk-revert").textContent).toMatch(/Revert hunk/);
  });

  test("added/untracked file → 'Delete hunk' (reverse-apply deletes the synthetic whole-file hunk)", () => {
    renderWith({
      fileStatus: "untracked",
      actions: { hunk: true, file: true, rename: false },
      hunk: HUNK,
      hideFileAction: true,
    });
    expect(screen.getByTestId("fv-hunk-revert").textContent).toMatch(/Delete hunk/);
  });
});

describe("HunkActionsBar — file-level vs per-hunk roles (should-fix 6)", () => {
  beforeEach(() => resetStore());
  afterEach(cleanup);

  test("per-hunk bar with hideFileAction shows ONLY Comment + hunk Revert (no file/rename)", () => {
    renderWith({
      fileStatus: "renamed",
      actions: { hunk: true, file: true, rename: true },
      hunk: HUNK,
      hideFileAction: true,
    });
    expect(screen.getByTestId("fv-hunk-comment")).toBeTruthy();
    expect(screen.getByTestId("fv-hunk-revert")).toBeTruthy();
    /* file + rename actions are NOT duplicated on a per-hunk bar. */
    expect(screen.queryByTestId("fv-hunk-file-revert")).toBeNull();
    expect(screen.queryByTestId("fv-hunk-rename-revert")).toBeNull();
  });

  test("file-level strip (fileLevelOnly, no hunk) shows Undo rename + Restore file, no Comment", () => {
    renderWith({
      fileStatus: "renamed",
      actions: { hunk: true, file: true, rename: true },
      fileLevelOnly: true,
      oldPath: "src/old.ts",
    });
    expect(screen.getByTestId("fv-hunk-rename-revert").textContent).toMatch(/Undo rename/);
    expect(screen.getByTestId("fv-hunk-file-revert").textContent).toMatch(/Restore file/);
    /* No per-hunk affordances on the file-level strip. */
    expect(screen.queryByTestId("fv-hunk-comment")).toBeNull();
    expect(screen.queryByTestId("fv-hunk-revert")).toBeNull();
  });

  test("file-level strip labels delete for untracked/added", () => {
    renderWith({
      fileStatus: "untracked",
      actions: { hunk: true, file: true, rename: false },
      fileLevelOnly: true,
    });
    expect(screen.getByTestId("fv-hunk-file-revert").textContent).toMatch(/Delete file/);
  });
});
