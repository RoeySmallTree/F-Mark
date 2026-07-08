/* Phase 3b — in-viewer line-comment affordance.

   Covers the renderer-agnostic core that both the Monaco affordance and the
   non-code overlay share:
   - useFileCommentPoster posts a `file-comment` prose with the right
     file_path / lines / line_context payload + scope, wakes tagged agents,
     and focuses the comments panel on the new {kind:"file"} target.
   - useFileCommentReveal opens the target file + sets pendingFileReveal when a
     file-comment target is focused (the reveal-on-click bridge).
   - buildLineContext / snippetForLines / toAbsoluteUnderRoot pure helpers.
*/

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { JSX } from "react";
import type { ProseMention } from "@f-mark/shared";
import { useStore } from "../../src/state/store.js";
import { useFileCommentPoster } from "../../src/panels/fileViewer/lineComment/useFileCommentPoster.js";
import { useFileCommentReveal } from "../../src/panels/fileViewer/lineComment/useFileCommentReveal.js";
import { FileDisplaySurfaceProvider } from "../../src/shell/fileDisplaySurface.js";
import {
  buildLineContext,
  snippetForLines,
} from "../../src/panels/fileViewer/lineComment/lineContext.js";
import { toAbsoluteUnderRoot } from "../../src/panels/fileViewer/lineComment/useFileCommentReveal.js";
import {
  normalizeRelSegments,
  toRootRelative,
} from "../../src/api/rootScope.js";
import { PARTICIPANTS, SESSION_META, jsonResponse } from "../cards/_helpers.js";

const ROOT = "/project";

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
    fileViewerDiffBySession: {},
    fileViewerModalOpen: false,
  });
}

/* Harness exposing the poster as a button so we can assert the network payload
   without rendering Monaco (heavy, jsdom-hostile). */
function PosterHarness({
  absPath,
  lines,
  content,
  mentions,
}: {
  absPath: string;
  lines: [number, number];
  content: string;
  mentions?: ProseMention[];
}): JSX.Element {
  const poster = useFileCommentPoster();
  return (
    <button
      type="button"
      onClick={() =>
        void poster.postFileComment({
          absPath,
          lines,
          content,
          ...(mentions ? { mentions } : {}),
          lineContext: buildLineContext("alpha\nbeta\ngamma\ndelta\n", lines),
        })
      }
    >
      post
    </button>
  );
}

function RevealHarness(): JSX.Element {
  useFileCommentReveal();
  return <div data-testid="reveal-harness" />;
}

describe("buildLineContext + snippetForLines", () => {
  const text = "line one\nline two\nline three\nline four\nline five";

  test("captures selected + before/after neighbors and a sha256", () => {
    const ctx = buildLineContext(text, [3, 3], 2);
    expect(ctx.selected).toBe("line three");
    expect(ctx.before).toBe("line one\nline two");
    expect(ctx.after).toBe("line four\nline five");
    expect(ctx.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test("omits before when at the top of the file", () => {
    const ctx = buildLineContext(text, [1, 2], 3);
    expect(ctx.selected).toBe("line one\nline two");
    expect(ctx.before).toBeUndefined();
    expect(ctx.after).toBe("line three\nline four\nline five");
  });

  test("clamps an out-of-range line range to file bounds", () => {
    const ctx = buildLineContext(text, [4, 99], 1);
    expect(ctx.selected).toBe("line four\nline five");
    expect(ctx.after).toBeUndefined();
  });

  test("snippetForLines flattens + truncates the selected range", () => {
    expect(snippetForLines(text, [1, 2])).toBe("line one line two");
    expect(snippetForLines("a".repeat(200), [1, 1], 10)).toBe("aaaaaaaaa…");
  });
});

describe("toAbsoluteUnderRoot", () => {
  test("joins a root-relative path onto the absolute root", () => {
    expect(toAbsoluteUnderRoot("/project", "src/a.ts")).toBe("/project/src/a.ts");
    expect(toAbsoluteUnderRoot("/project/", "src/a.ts")).toBe("/project/src/a.ts");
    expect(toAbsoluteUnderRoot("/project", "")).toBe("/project");
    /* In-bounds `.`/`..` normalize without escaping. */
    expect(toAbsoluteUnderRoot("/project", "src/./a.ts")).toBe("/project/src/a.ts");
    expect(toAbsoluteUnderRoot("/project", "src/sub/../a.ts")).toBe(
      "/project/src/a.ts",
    );
  });
  test("returns null when no root is known", () => {
    expect(toAbsoluteUnderRoot(null, "src/a.ts")).toBeNull();
  });
  test("REFUSES traversal: a stored ../secret must not open /project/../secret", () => {
    expect(toAbsoluteUnderRoot("/project", "../secret")).toBeNull();
    expect(toAbsoluteUnderRoot("/project", "src/../../secret")).toBeNull();
    expect(toAbsoluteUnderRoot("/project", "..")).toBeNull();
  });
  test("REFUSES absolute / drive-prefixed stored paths", () => {
    expect(toAbsoluteUnderRoot("/project", "/etc/passwd")).toBeNull();
    expect(toAbsoluteUnderRoot("/project", "C:/Windows")).toBeNull();
    expect(toAbsoluteUnderRoot("/project", "\\\\host\\share")).toBeNull();
  });
});

describe("toRootRelative / normalizeRelSegments — path-traversal hardening", () => {
  test("toRootRelative strips the root prefix for in-bounds paths", () => {
    expect(toRootRelative("/project", "/project/src/a.ts")).toBe("src/a.ts");
    expect(toRootRelative("/project", "/project")).toBe("");
    expect(toRootRelative("/project/", "/project/x")).toBe("x");
  });
  test("toRootRelative REJECTS a crafted absPath that escapes via ..", () => {
    /* The original prefix-only check returned "../secret" here. */
    expect(toRootRelative("/project", "/project/../secret")).toBeNull();
    expect(toRootRelative("/project", "/project/a/../../secret")).toBeNull();
  });
  test("toRootRelative returns null for paths outside the root", () => {
    expect(toRootRelative("/project", "/elsewhere/x.ts")).toBeNull();
    expect(toRootRelative("/project", "/projectX/x.ts")).toBeNull();
  });
  test("toRootRelative normalizes in-bounds . / .. segments", () => {
    expect(toRootRelative("/project", "/project/src/./a.ts")).toBe("src/a.ts");
    expect(toRootRelative("/project", "/project/src/sub/../a.ts")).toBe(
      "src/a.ts",
    );
  });
  test("normalizeRelSegments: collapses, rejects leading .., rejects absolute", () => {
    expect(normalizeRelSegments("a/b/../c")).toBe("a/c");
    expect(normalizeRelSegments("./a/./b")).toBe("a/b");
    expect(normalizeRelSegments("")).toBe("");
    expect(normalizeRelSegments("a/..")).toBe("");
    expect(normalizeRelSegments("../x")).toBeNull();
    expect(normalizeRelSegments("a/../../x")).toBeNull();
    expect(normalizeRelSegments("/abs")).toBeNull();
    expect(normalizeRelSegments("C:/win")).toBeNull();
  });
});

describe("useFileCommentPoster.postFileComment", () => {
  beforeEach(() => resetStore());
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("posts a file-comment with file_path/lines/line_context + scope, then focuses comments", async () => {
    const user = userEvent.setup();
    const calls: { url: string; body: unknown }[] = [];
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith("/events/prose") && init?.method === "POST") {
          calls.push({ url: u, body: JSON.parse(init.body as string) });
          return Promise.resolve(
            jsonResponse({ filename: "20260613T120000Z_us-a7f3.prose.md" }),
          );
        }
        if (u.includes("/events")) {
          return Promise.resolve(jsonResponse({ events: [] }));
        }
        return Promise.resolve(jsonResponse({}));
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PosterHarness absPath="/project/src/a.ts" lines={[2, 3]} content="needs a fix" />,
    );
    await user.click(screen.getByRole("button", { name: "post" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(calls).toHaveLength(1);
    const body = calls[0]!.body as Record<string, unknown>;
    expect(body.participant_id).toBe("us-a7f3");
    expect(body.content).toBe("needs a fix");
    /* Root-relative path (NOT the absolute viewer path). */
    expect(body.file_path).toBe("src/a.ts");
    expect(body.lines).toEqual([2, 3]);
    /* File comments must NOT carry the event-anchored fields. */
    expect(body.append_to).toBeUndefined();
    expect(body.mode).toBeUndefined();
    /* Drift-repair context rode along. */
    const lc = body.line_context as Record<string, unknown>;
    expect(lc.selected).toBe("beta\ngamma");
    expect(lc.sha256).toMatch(/^[0-9a-f]{64}$/);
    /* Scope (X2) — path_id from the session. */
    expect(body.path_id).toBe("project-id");

    /* Focuses the comments panel on the new file target. */
    const state = useStore.getState();
    expect(state.commentTarget).toEqual({
      kind: "file",
      file_path: "src/a.ts",
      lines: [2, 3],
    });
    expect(state.rightTab).toBe("comments");
  });

  test("wakes tagged agents with the comment reason + scope", async () => {
    const user = userEvent.setup();
    let wakeBody: Record<string, unknown> | null = null;
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith("/events/prose") && init?.method === "POST") {
          return Promise.resolve(
            jsonResponse({ filename: "20260613T120100Z_us-a7f3.prose.md" }),
          );
        }
        if (u.includes("/wake") && init?.method === "POST") {
          wakeBody = JSON.parse(init.body as string);
          return Promise.resolve(jsonResponse({ woken: ["ag-c92e"] }));
        }
        if (u.includes("/events")) {
          return Promise.resolve(jsonResponse({ events: [] }));
        }
        return Promise.resolve(jsonResponse({}));
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PosterHarness
        absPath="/project/src/a.ts"
        lines={[1, 1]}
        content="@Claude take a look"
        mentions={[
          { participant_id: "ag-c92e", display_name: "Claude", token: "@Claude" },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "post" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(wakeBody).not.toBeNull();
    expect(wakeBody!.reason).toBe("comment");
    expect(wakeBody!.target_participant_ids).toEqual(["ag-c92e"]);
    expect(wakeBody!.path_id).toBe("project-id");
  });

  test("refuses to post for a path outside the project root", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PosterHarness absPath="/elsewhere/x.ts" lines={[1, 1]} content="nope" />,
    );
    await user.click(screen.getByRole("button", { name: "post" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const proseCall = fetchMock.mock.calls.find(([url, init]) =>
      String(url).endsWith("/events/prose") &&
      (init as RequestInit | undefined)?.method === "POST",
    );
    expect(proseCall).toBeUndefined();
    expect(useStore.getState().commentTarget).toBeNull();
  });
});

describe("useFileCommentReveal — reveal-on-click bridge", () => {
  beforeEach(() => resetStore());
  afterEach(() => cleanup());

  test("opens the target file + sets pendingFileReveal when a file-comment is focused", async () => {
    render(<RevealHarness />);
    /* Simulate clicking a FileCommentCard / thread (which sets a file target). */
    act(() => {
      useStore.getState().setCommentTarget({
        kind: "file",
        file_path: "src/a.ts",
        lines: [5, 7],
      });
    });

    await waitFor(() => {
      const s = useStore.getState();
      expect(s.fileViewerActiveBySession[SESSION_META.id]).toBe(
        "/project/src/a.ts",
      );
      expect(s.pendingFileReveal).not.toBeNull();
      expect(s.rightTab).toBe("files");
    });
    const reveal = useStore.getState().pendingFileReveal!;
    expect(reveal.absPath).toBe("/project/src/a.ts");
    expect(reveal.line).toBe(5);
  });

  test("a SECOND click on the same file/line refires the reveal (new nonce)", async () => {
    render(<RevealHarness />);
    act(() => {
      useStore.getState().setCommentTarget({
        kind: "file",
        file_path: "src/a.ts",
        lines: [5, 7],
      });
    });
    await waitFor(() =>
      expect(useStore.getState().pendingFileReveal).not.toBeNull(),
    );
    const firstNonce = useStore.getState().pendingFileReveal!.nonce;

    /* Click the SAME comment again → a fresh commentTarget OBJECT with the same
       value. Value-based de-dupe wrongly suppressed the second reveal entirely
       (it returned before requestFileReveal); object-reference de-dupe lets it
       refire, bumping the reveal nonce so the renderer's effect re-runs even
       though absPath+line are unchanged. */
    act(() => {
      useStore.getState().setCommentTarget({
        kind: "file",
        file_path: "src/a.ts",
        lines: [5, 7],
      });
    });
    await waitFor(() =>
      expect(useStore.getState().pendingFileReveal!.nonce).toBe(firstNonce + 1),
    );
    expect(useStore.getState().pendingFileReveal!.line).toBe(5);
  });

  test("REFUSES reveal for a crafted traversal file_path (../secret)", async () => {
    render(<RevealHarness />);
    act(() => {
      useStore.getState().setCommentTarget({
        kind: "file",
        file_path: "../secret",
        lines: [1, 1],
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    /* Must NOT open /project/../secret nor push a reveal. */
    expect(useStore.getState().pendingFileReveal).toBeNull();
    expect(
      useStore.getState().fileViewerActiveBySession[SESSION_META.id],
    ).toBeUndefined();
  });

  test("opens the target file for a whole-file (no lines) target without line reveal", async () => {
    render(<RevealHarness />);
    act(() => {
      useStore.getState().setCommentTarget({
        kind: "file",
        file_path: "src/a.ts",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(useStore.getState().fileViewerActiveBySession[SESSION_META.id]).toBe(
      "/project/src/a.ts",
    );
    expect(useStore.getState().pendingFileReveal).toBeNull();
  });

  test("ignores event-anchored targets (chat-document comments)", async () => {
    render(<RevealHarness />);
    act(() => {
      useStore.getState().setCommentTarget({
        kind: "event",
        file: "20260613T1.prose.md",
        lines: [1, 2],
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(useStore.getState().pendingFileReveal).toBeNull();
    expect(
      useStore.getState().fileViewerActiveBySession[SESSION_META.id],
    ).toBeUndefined();
  });
});

describe("useFileCommentReveal — surfaces a viewer + forces non-diff mode (blockers 2 & 3)", () => {
  beforeEach(() => resetStore());
  afterEach(() => cleanup());

  function focusFileComment(): void {
    act(() => {
      useStore.getState().setCommentTarget({
        kind: "file",
        file_path: "src/a.ts",
        lines: [5, 7],
      });
    });
  }

  test("forces the target tab into NON-diff (none) mode before revealing (blocker 3)", async () => {
    /* Default diff mode for the tab is 'current-session' — the reveal consumer
       (MonacoRenderer/RenderedLineCommentRail) only mounts in the non-diff
       branch, so the bridge must flip the tab to 'none'. */
    render(<RevealHarness />);
    focusFileComment();

    await waitFor(() => {
      const s = useStore.getState();
      const mode =
        s.fileViewerDiffBySession[SESSION_META.id]?.["/project/src/a.ts"]?.mode;
      expect(mode).toBe("none");
    });
    /* A reveal was still pushed (consumer will mount in the non-diff branch). */
    expect(useStore.getState().pendingFileReveal).not.toBeNull();
    expect(useStore.getState().pendingFileReveal!.absPath).toBe(
      "/project/src/a.ts",
    );
  });

  test("reveal surfaces the file viewer via the FileDisplaySurface context", async () => {
    const surfaced = vi.fn();
    render(
      <FileDisplaySurfaceProvider value={surfaced}>
        <RevealHarness />
      </FileDisplaySurfaceProvider>,
    );
    focusFileComment();

    await waitFor(() => {
      expect(surfaced).toHaveBeenCalled();
    });
    /* And the reveal still fired + the file opened. */
    expect(useStore.getState().pendingFileReveal!.absPath).toBe(
      "/project/src/a.ts",
    );
  });

  test("media/binary target opens the file but does NOT leave a stale pendingFileReveal", async () => {
    /* A png has no non-diff reveal consumer; the bridge must skip
       requestFileReveal so pendingFileReveal can't go stale. */
    render(<RevealHarness />);
    act(() => {
      useStore.getState().setCommentTarget({
        kind: "file",
        file_path: "assets/logo.png",
        lines: [1, 1],
      });
    });
    await waitFor(() => {
      expect(
        useStore.getState().fileViewerActiveBySession[SESSION_META.id],
      ).toBe("/project/assets/logo.png");
    });
    expect(useStore.getState().pendingFileReveal).toBeNull();
  });
});
