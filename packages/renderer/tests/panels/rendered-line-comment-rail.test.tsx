/* Phase 3b — RenderedLineCommentRail overlay (markdown / csv viewer comments).

   The overlay wraps a non-code renderer and provides the hover/select →
   "add comment" rail + draft popover + reveal band. These tests render the
   overlay around a deterministic stub child (so they don't pull in
   cherry-markdown / papaparse) and assert:
   - existing file comments for THIS file surface as rail markers,
   - clicking an existing marker focuses that file/line in the comments panel,
   - a pendingFileReveal for this path is consumed (cleared) by the overlay,
   - opening a draft (hover → marker) and submitting posts a file-comment.
*/

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RenderedLineCommentRail } from "../../src/panels/fileViewer/lineComment/RenderedLineCommentRail.js";
import { useStore } from "../../src/state/store.js";
import { PARTICIPANTS, SESSION_META, jsonResponse, makeProse } from "../cards/_helpers.js";

const ROOT = "/project";
const TEXT = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");

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
    composeMode: "message",
    commentTarget: null,
    pendingFileReveal: null,
    focusedCommentId: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    activeModal: null,
    activePopover: { key: null, anchorRect: null },
    fileViewerTabsBySession: {},
    fileViewerActiveBySession: {},
  });
}

function mockFilesText(extra?: (u: string, init?: RequestInit) => Response | null) {
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const fromExtra = extra?.(u, init);
      if (fromExtra !== null && fromExtra !== undefined) {
        return Promise.resolve(fromExtra);
      }
      if (u.includes("/files/text")) {
        return Promise.resolve(jsonResponse({ content: TEXT, truncated: false }));
      }
      if (u.includes("/events")) {
        return Promise.resolve(jsonResponse({ events: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("RenderedLineCommentRail", () => {
  beforeEach(() => resetStore());
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    document.body.innerHTML = "";
  });

  test("renders existing file-comment markers for this file", async () => {
    const comment = makeProse(
      "20260613T120000Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "look here", file_path: "src/a.ts", lines: [4, 6] },
    );
    useStore.setState({ events: [comment] });
    mockFilesText();

    render(
      <RenderedLineCommentRail path="/project/src/a.ts">
        <div style={{ height: 400 }}>{TEXT}</div>
      </RenderedLineCommentRail>,
    );

    const marker = await screen.findByLabelText(/Open comment on lines 4-6/i);
    expect(marker).toBeInTheDocument();
    const anchor = marker.closest(".line-comment-anchor");
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute("data-target-lines")).toBe("4:6");
    expect(anchor!.querySelector(".line-comment-bar")).not.toBeNull();
  });

  test("does NOT show markers for comments on a different file", async () => {
    const other = makeProse(
      "20260613T120000Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "elsewhere", file_path: "src/other.ts", lines: [1, 1] },
    );
    useStore.setState({ events: [other] });
    mockFilesText();

    render(
      <RenderedLineCommentRail path="/project/src/a.ts">
        <div>{TEXT}</div>
      </RenderedLineCommentRail>,
    );
    await waitFor(() =>
      expect(
        document.querySelector(".fv-line-comment-content")?.textContent ?? "",
      ).toContain("line 20"),
    );
    expect(screen.queryByLabelText(/Open comment/i)).toBeNull();
  });

  test("clicking an existing marker focuses that file/line in the comments panel", async () => {
    const comment = makeProse(
      "20260613T120000Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "look here", file_path: "src/a.ts", lines: [2, 2] },
    );
    useStore.setState({ events: [comment] });
    mockFilesText();
    const user = userEvent.setup();

    render(
      <RenderedLineCommentRail path="/project/src/a.ts">
        <div style={{ height: 400 }}>{TEXT}</div>
      </RenderedLineCommentRail>,
    );
    const marker = await screen.findByLabelText(/Open comment on line 2/i);
    await user.click(marker);

    const s = useStore.getState();
    expect(s.commentTarget).toEqual({
      kind: "file",
      file_path: "src/a.ts",
      lines: [2, 2],
    });
    expect(s.rightTab).toBe("comments");
  });

  test("consumes a pendingFileReveal targeting this path", async () => {
    mockFilesText();
    render(
      <RenderedLineCommentRail path="/project/src/a.ts">
        <div style={{ height: 400 }}>{TEXT}</div>
      </RenderedLineCommentRail>,
    );
    await waitFor(() =>
      expect(
        document.querySelector(".fv-line-comment-content")?.textContent ?? "",
      ).toContain("line 20"),
    );

    act(() => {
      useStore.getState().requestFileReveal("/project/src/a.ts", 5);
    });
    await waitFor(() => {
      expect(useStore.getState().pendingFileReveal).toBeNull();
    });
  });

  test("leaves a pendingFileReveal for a DIFFERENT path untouched", async () => {
    mockFilesText();
    render(
      <RenderedLineCommentRail path="/project/src/a.ts">
        <div style={{ height: 400 }}>{TEXT}</div>
      </RenderedLineCommentRail>,
    );
    await waitFor(() =>
      expect(
        document.querySelector(".fv-line-comment-content")?.textContent ?? "",
      ).toContain("line 20"),
    );

    act(() => {
      useStore.getState().requestFileReveal("/project/src/b.ts", 3);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(useStore.getState().pendingFileReveal).not.toBeNull();
    expect(useStore.getState().pendingFileReveal!.absPath).toBe(
      "/project/src/b.ts",
    );
  });

  test("non-metadata content still posts a line comment from the hover line", async () => {
    const posted: Record<string, unknown>[] = [];
    mockFilesText((u, init) => {
      if (u.endsWith("/events/prose") && init?.method === "POST") {
        posted.push(JSON.parse(init.body as string));
        return jsonResponse({ filename: "20260613T130000Z_us-a7f3.prose.md" });
      }
      return null;
    });
    const user = userEvent.setup();

    const { container } = render(
      <RenderedLineCommentRail path="/project/src/a.ts">
        <div style={{ height: 400 }}>{TEXT}</div>
      </RenderedLineCommentRail>,
    );
    await waitFor(() =>
      expect(
        document.querySelector(".fv-line-comment-content")?.textContent ?? "",
      ).toContain("line 20"),
    );

    /* Hover the content to surface the draft marker, then click it. jsdom's
       getBoundingClientRect is shimmed (top 0), so a clientY maps into the
       fallback line layout. */
    const content = container.querySelector(
      ".fv-line-comment-content",
    ) as HTMLElement;
    fireEvent.mouseMove(content, { clientY: 30 });

    const draftMarker = await screen.findByLabelText(/Add comment on line/i);
    await user.click(draftMarker);

    const popover = await screen.findByLabelText(/^Comment on line/i);
    await user.type(popover, "viewer comment");
    await user.click(screen.getByRole("button", { name: /^Comment$/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    const body = posted[0]!;
    expect(body.file_path).toBe("src/a.ts");
    expect(body.content).toBe("viewer comment");
    expect(Array.isArray(body.lines)).toBe(true);
    expect(body.line_context).toBeDefined();
    expect(body.path_id).toBe("project-id");
  });

  test("content with data-source-line (CSV-like) posts a PRECISE line comment + line_context", async () => {
    const posted: Record<string, unknown>[] = [];
    mockFilesText((u, init) => {
      if (u.endsWith("/events/prose") && init?.method === "POST") {
        posted.push(JSON.parse(init.body as string));
        return jsonResponse({ filename: "20260613T130000Z_us-a7f3.prose.md" });
      }
      return null;
    });
    const user = userEvent.setup();

    /* A table whose rows carry real source-line metadata — the rail measures
       and posts by these, so anchoring is exact. */
    const { container } = render(
      <RenderedLineCommentRail path="/project/data.csv">
        <table>
          <tbody>
            {Array.from({ length: 10 }, (_, i) => (
              <tr key={i} data-source-line={i + 2}>
                <td>row {i + 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </RenderedLineCommentRail>,
    );
    await waitFor(() =>
      expect(
        document.querySelector(".fv-line-comment-content")?.textContent ?? "",
      ).toContain("row 10"),
    );

    const content = container.querySelector(
      ".fv-line-comment-content",
    ) as HTMLElement;
    fireEvent.mouseMove(content, { clientY: 30 });

    const draftMarker = await screen.findByLabelText(/Add comment on line/i);
    await user.click(draftMarker);

    const popover = await screen.findByLabelText(/^Comment on line/i);
    await user.type(popover, "csv row comment");
    await user.click(screen.getByRole("button", { name: /^Comment$/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    const body = posted[0]!;
    expect(body.file_path).toBe("data.csv");
    expect(body.content).toBe("csv row comment");
    expect(Array.isArray(body.lines)).toBe(true);
    expect(body.line_context).toBeDefined();
  });

  test("removed and resolved supersession markers do not surface as live rail markers", async () => {
    /* A file comment on lines 4-6, a SECOND comment on lines 8-9 that is then
       REMOVED (its `_removed_` marker supersedes it), and a THIRD on 12-13 that
       is RESOLVED. The removed one must vanish; the resolved one stays but is
       flagged resolved; the plain one renders normally. Markers themselves
       (no file_path) must never render. */
    const live = makeProse(
      "20260613T120000Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "still here", file_path: "src/a.ts", lines: [4, 6] },
    );
    const removedComment = makeProse(
      "20260613T120100Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "to be removed", file_path: "src/a.ts", lines: [8, 9] },
    );
    const removedMarker = makeProse(
      "20260613T120200Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "_removed_", supersedes: removedComment.filename },
    );
    const resolvedComment = makeProse(
      "20260613T120300Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "to be resolved", file_path: "src/a.ts", lines: [12, 13] },
    );
    const resolvedMarker = makeProse(
      "20260613T120400Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "_resolved_", supersedes: resolvedComment.filename },
    );
    useStore.setState({
      events: [
        live,
        removedComment,
        removedMarker,
        resolvedComment,
        resolvedMarker,
      ],
    });
    mockFilesText();

    render(
      <RenderedLineCommentRail path="/project/src/a.ts">
        <div style={{ height: 400 }}>{TEXT}</div>
      </RenderedLineCommentRail>,
    );

    /* Live + resolved markers present. */
    expect(await screen.findByLabelText(/Open comment on lines 4-6/i)).toBeInTheDocument();
    const resolvedRail = await screen.findByLabelText(/Open comment on lines 12-13/i);
    expect(resolvedRail).toBeInTheDocument();
    expect(resolvedRail.classList.contains("resolved")).toBe(true);
    /* Removed comment's line range must NOT render. */
    expect(screen.queryByLabelText(/Open comment on lines 8-9/i)).toBeNull();
    /* No marker should ever surface a "_removed_"/"_resolved_" body. */
    expect(document.body.textContent ?? "").not.toContain("_removed_");
    expect(document.body.textContent ?? "").not.toContain("_resolved_");
  });
});
