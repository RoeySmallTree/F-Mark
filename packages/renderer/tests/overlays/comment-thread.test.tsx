/* Phase 14 — CommentThreadOverlay tests.
   Covers:
   - When commentTarget is null → right panel shows tabs (not overlay).
   - When commentTarget is set → right panel shows the overlay.
   - Anchor-snippet appears with quoted lines.
   - Comments render as threads; replies (in_reply_to) nest under their root.
   - Close button clears commentTarget.
   - Reply input + Enter posts a new prose with in_reply_to.
   - Resolve button posts a supersession.
   - isResolvedComment helper correctly flags resolved threads.
   - Resolved thread shows .resolved class and the resolve-btn is styled.
*/

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Participant } from "@f-mark/shared";
import { RightPanel } from "../../src/shell/RightPanel.js";
import {
  CommentThreadOverlay,
  isResolvedComment,
} from "../../src/overlays/CommentThreadOverlay.js";
import { useStore } from "../../src/state/store.js";
import {
  PARTICIPANTS,
  SESSION_META,
  makeProse,
  jsonResponse,
} from "../cards/_helpers.js";

function resetStore(): void {
  useStore.setState({
    token: null,
    sessions: [SESSION_META],
    currentSessionId: SESSION_META.id,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: [],
    composeMode: "message",
    commentTarget: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    activeModal: null,
    activePopover: { key: null, anchorRect: null },
  });
}

describe("CommentThreadOverlay — routing via RightPanel", () => {
  beforeEach(() => {
    resetStore();
    // RightTodos panel fetches /todos when the tabs are rendered.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ open: [], wip: [], done: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("when commentTarget is null, RightPanel shows the tab navigation", () => {
    render(<RightPanel />);
    expect(
      screen.getByRole("tablist", { name: /right panel tabs/i }),
    ).toBeInTheDocument();
  });

  test("when commentTarget is set, RightPanel switches to the comments tab", () => {
    const target = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Launch Plan", content: "Hello world\nLine two\nLine three" },
    );
    const comment = makeProse(
      "20260522T120100Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "Pin this",
        append_to: target.filename,
        mode: "comment",
      },
    );
    useStore.setState({
      events: [target, comment],
      commentTarget: { file: target.filename },
    });

    render(<RightPanel />);
    expect(
      screen.getByRole("tablist", { name: /right panel tabs/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /comments/i }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Launch Plan")).toBeInTheDocument();
    expect(screen.getByText(/Pin this/i)).toBeInTheDocument();
  });
});

describe("CommentThreadOverlay — anchor-snippet + threads", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("anchor-snippet appears when commentTarget.lines is set and quotes the line range", () => {
    const target = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      {
        name: "Launch Plan",
        content: "Line one\nLine two\nLine three\nLine four",
      },
    );
    useStore.setState({
      events: [target],
      commentTarget: { file: target.filename, lines: [2, 3] },
    });

    const { container } = render(
      <CommentThreadOverlay targetFile={target.filename} comments={[]} />,
    );
    const snippet = container.querySelector(".anchor-snippet");
    expect(snippet).not.toBeNull();
    expect(snippet!.textContent).toContain("Lines 2-3");
    expect(snippet!.textContent).toContain("Line two");
    expect(snippet!.textContent).toContain("Line three");
  });

  test("anchor-snippet is omitted when commentTarget.lines is undefined", () => {
    const target = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Launch Plan", content: "Body" },
    );
    useStore.setState({
      events: [target],
      commentTarget: { file: target.filename },
    });
    const { container } = render(
      <CommentThreadOverlay targetFile={target.filename} comments={[]} />,
    );
    expect(container.querySelector(".anchor-snippet")).toBeNull();
  });

  test("comments render as threads; replies (in_reply_to) render with .reply class", () => {
    const target = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Plan", content: "body" },
    );
    const root = makeProse(
      "20260522T120100Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "Root comment",
        target: { file: target.filename, lines: [1, 1] },
      },
    );
    const reply = makeProse(
      "20260522T120200Z_ag-c92e.prose.md",
      "ag-c92e",
      {
        content: "A reply",
        target: { file: target.filename, lines: [1, 1] },
        in_reply_to: root.filename,
      },
    );
    useStore.setState({
      events: [target, root, reply],
      commentTarget: { file: target.filename, lines: [1, 1] },
    });

    const { container } = render(
      <CommentThreadOverlay
        targetFile={target.filename}
        comments={[root, reply]}
      />,
    );

    const threads = container.querySelectorAll(".thread");
    expect(threads.length).toBe(1); // reply nests under root, not its own thread.
    const msgs = container.querySelectorAll(".thread-msg");
    expect(msgs.length).toBe(2);
    const replyMsg = container.querySelector(".thread-msg.reply");
    expect(replyMsg).not.toBeNull();
    expect(replyMsg!.textContent).toContain("A reply");

    // Root msg appears first, reply second.
    const root_el = msgs[0]!;
    expect(root_el.textContent).toContain("Root comment");
    expect(root_el.className).not.toContain("reply");
  });

  test("displays target title from first 40 chars of content when name is missing", () => {
    const long =
      "This is a long unnamed paragraph that should be truncated nicely after forty characters.";
    const target = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      { content: long },
    );
    useStore.setState({
      events: [target],
      commentTarget: { file: target.filename },
    });
    render(<CommentThreadOverlay targetFile={target.filename} comments={[]} />);
    // First 40 chars of `long`.
    const expected = long.slice(0, 40);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe("CommentThreadOverlay — close button", () => {
  beforeEach(() => {
    resetStore();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ open: [], wip: [], done: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("focused comments keep the tab UI visible", () => {
    const target = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Plan", content: "body" },
    );
    const comment = makeProse(
      "20260522T120100Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "Thread",
        append_to: target.filename,
        mode: "comment",
      },
    );
    useStore.setState({
      events: [target, comment],
      commentTarget: { file: target.filename },
    });

    render(<RightPanel />);

    expect(useStore.getState().commentTarget).not.toBeNull();
    expect(
      screen.getByRole("tablist", { name: /right panel tabs/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Thread")).toBeInTheDocument();
  });
});

describe("CommentThreadOverlay — reply behavior", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("typing into the reply input and pressing Enter posts a new prose with in_reply_to", async () => {
    const user = userEvent.setup();
    const target = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Plan", content: "body" },
    );
    const root = makeProse(
      "20260522T120100Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "Root comment",
        target: { file: target.filename, lines: [1, 1] },
      },
    );
    useStore.setState({
      events: [target, root],
      commentTarget: { file: target.filename, lines: [1, 1] },
    });

    const fetchMock = vi
      .fn()
      .mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith("/events/prose") && init?.method === "POST") {
          return Promise.resolve(
            jsonResponse({ filename: "20260522T120300Z_us-a7f3.prose.md" }),
          );
        }
        if (u.includes("/events") && !init) {
          return Promise.resolve(jsonResponse({ events: [target, root] }));
        }
        if (u.includes("/events")) {
          return Promise.resolve(jsonResponse({ events: [target, root] }));
        }
        return Promise.resolve(jsonResponse({}));
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CommentThreadOverlay
        targetFile={target.filename}
        comments={[root]}
      />,
    );

    const replyInput = screen.getByLabelText(/reply to roey/i);
    await user.type(replyInput, "Sounds good");
    await user.keyboard("{Enter}");

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const proseCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        String(url).endsWith("/events/prose") &&
        (init as RequestInit | undefined)?.method === "POST"
      );
    });
    expect(proseCall).toBeDefined();
    const body = JSON.parse(
      (proseCall![1] as RequestInit).body as string,
    );
    expect(body.participant_id).toBe("us-a7f3");
    expect(body.content).toBe("Sounds good");
    expect(body.in_reply_to).toBe(root.filename);
    /* Composable-prose Phase 2: replies POST the new shape. */
    expect(body.target).toBeUndefined();
    expect(body.append_to).toBe(target.filename);
    expect(body.mode).toBe("comment");
    expect(body.lines).toEqual([1, 1]);
  });

  test("empty reply does NOT post on Enter", async () => {
    const user = userEvent.setup();
    const target = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Plan", content: "body" },
    );
    const root = makeProse(
      "20260522T120100Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "Root",
        target: { file: target.filename },
      },
    );
    useStore.setState({
      events: [target, root],
      commentTarget: { file: target.filename },
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CommentThreadOverlay
        targetFile={target.filename}
        comments={[root]}
      />,
    );
    const input = screen.getByLabelText(/reply to roey/i);
    input.focus();
    await user.keyboard("{Enter}");

    const proseCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        String(url).endsWith("/events/prose") &&
        (init as RequestInit | undefined)?.method === "POST"
      );
    });
    expect(proseCall).toBeUndefined();
  });
});

describe("CommentThreadOverlay — resolve behavior", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("clicking the Resolve button posts a supersession prose", async () => {
    const user = userEvent.setup();
    const target = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Plan", content: "body" },
    );
    const root = makeProse(
      "20260522T120100Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "Pin",
        target: { file: target.filename, lines: [2, 3] },
      },
    );
    useStore.setState({
      events: [target, root],
      commentTarget: { file: target.filename, lines: [2, 3] },
    });

    const fetchMock = vi
      .fn()
      .mockImplementation((url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith("/events/prose") && init?.method === "POST") {
          return Promise.resolve(
            jsonResponse({ filename: "20260522T120400Z_us-a7f3.prose.md" }),
          );
        }
        if (u.includes("/events")) {
          return Promise.resolve(jsonResponse({ events: [target, root] }));
        }
        return Promise.resolve(jsonResponse({}));
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CommentThreadOverlay
        targetFile={target.filename}
        comments={[root]}
      />,
    );

    const btn = screen.getByRole("button", { name: /^Resolve$/i });
    await user.click(btn);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const call = fetchMock.mock.calls.find(([url, init]) => {
      return (
        String(url).endsWith("/events/prose") &&
        (init as RequestInit | undefined)?.method === "POST"
      );
    });
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.participant_id).toBe("us-a7f3");
    expect(body.supersedes).toBe(root.filename);
    expect(body.content).toBe("_resolved_");
    /* Composable-prose Phase 2: resolves POST the new shape. */
    expect(body.target).toBeUndefined();
    expect(body.append_to).toBe(target.filename);
    expect(body.mode).toBe("comment");
    expect(body.lines).toEqual([2, 3]);
  });

  test("resolved threads render with .thread.resolved class and 'Resolved' label", () => {
    const target = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Plan", content: "body" },
    );
    const root = makeProse(
      "20260522T120100Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "Pin",
        target: { file: target.filename },
      },
    );
    const resolution = makeProse(
      "20260522T120200Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "_resolved_",
        target: { file: target.filename },
        supersedes: root.filename,
      },
    );
    useStore.setState({
      events: [target, root, resolution],
      commentTarget: { file: target.filename },
    });

    // Aggregator would hide `root` from the visible feed, but the overlay
    // surfaces it by reading raw events.
    const { container } = render(
      <CommentThreadOverlay targetFile={target.filename} comments={[]} />,
    );
    const thread = container.querySelector(".thread.resolved");
    expect(thread).not.toBeNull();
    expect(
      within(thread as HTMLElement).getByText(/✓ Resolved/i),
    ).toBeInTheDocument();
    const btn = within(thread as HTMLElement).getByRole("button", {
      name: /resolved/i,
    });
    expect(btn.className).toContain("resolved");
    expect(btn).toBeDisabled();
  });
});

describe("isResolvedComment helper", () => {
  test("returns true if another comment supersedes the given comment", () => {
    const a = makeProse(
      "20260522T120100Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "Root", target: { file: "x" } },
    );
    const b = makeProse(
      "20260522T120200Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "_resolved_", target: { file: "x" }, supersedes: a.filename },
    );
    expect(isResolvedComment(a, [a, b])).toBe(true);
  });

  test("returns false when no comment supersedes it", () => {
    const a = makeProse(
      "20260522T120100Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "Root", target: { file: "x" } },
    );
    expect(isResolvedComment(a, [a])).toBe(false);
  });

  test("ignores self-supersedes (defensive)", () => {
    const a = makeProse(
      "20260522T120100Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "Root",
        target: { file: "x" },
        supersedes: "20260522T120100Z_us-a7f3.prose.md",
      },
    );
    expect(isResolvedComment(a, [a])).toBe(false);
  });
});

describe("ProseCard — focused class when commentTarget matches", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("prose-card gets .focused class when its filename matches commentTarget.file", async () => {
    const { ProseCard } = await import("../../src/cards/ProseCard.js");
    const ev = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Plan", content: "body" },
    );
    useStore.setState({
      events: [ev],
      commentTarget: { file: ev.filename },
    });
    const { container } = render(
      <ProseCard event={ev} participants={PARTICIPANTS} comments={[]} />,
    );
    expect(container.querySelector(".prose-card.focused")).not.toBeNull();
  });

  test("prose-card does NOT get .focused class when commentTarget is null", async () => {
    const { ProseCard } = await import("../../src/cards/ProseCard.js");
    const ev = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Plan", content: "body" },
    );
    useStore.setState({ events: [ev], commentTarget: null });
    const { container } = render(
      <ProseCard event={ev} participants={PARTICIPANTS} comments={[]} />,
    );
    expect(container.querySelector(".prose-card.focused")).toBeNull();
  });

  test("prose-card does NOT get .focused class when commentTarget.file is a different file", async () => {
    const { ProseCard } = await import("../../src/cards/ProseCard.js");
    const ev = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Plan", content: "body" },
    );
    useStore.setState({
      events: [ev],
      commentTarget: { file: "different-file.md" },
    });
    const { container } = render(
      <ProseCard event={ev} participants={PARTICIPANTS} comments={[]} />,
    );
    expect(container.querySelector(".prose-card.focused")).toBeNull();
    // Still has the base prose-card class though.
    expect(container.querySelector(".prose-card")).not.toBeNull();
  });
});
