/* Task 20 — wiring projectFeed + ArbitraryGroupCard into the Feed.

   Given a stream of [arbitrary prose, tool-use, concluding prose] from the
   same participant, the Feed should render a single collapsed group card
   PLUS the concluding prose as its own card. */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { Feed } from "../../src/shell/Feed.js";
import { useStore } from "../../src/state/store.js";
import type { SessionMeta } from "../../src/api/client.js";
import { DEFAULT_FILTER } from "../../src/popovers/log-filter-types.js";
import { renderWithAgentSpawn as render } from "../agentSpawnProvider.js";

const SESSION: SessionMeta = {
  id: "2026-05-22-task-20",
  slug: "task-20",
  created_at: "2026-05-22T10:00:00Z",
};

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-claude": { kind: "agent", name: "Claude", color: "#b86a1f" },
};

function arbitraryProse(ts: string, content: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.prose.md`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "prose",
    payload: { content, arbitrary: true },
  };
}

function tool(ts: string, name: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.tool-use.json`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "tool-use",
    payload: { tool_name: name, tool_use_id: "tu_1", input: {}, success: true },
  };
}

function concludingProse(ts: string, content: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.prose.md`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "prose",
    payload: { content },
  };
}

function namedProse(ts: string, content: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.prose.md`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "prose",
    payload: { name: "Launch plan", content },
  };
}

function commentProse(
  ts: string,
  content: string,
  targetFile: string,
): AnyEventRecord {
  return {
    filename: `${ts}_us-a7f3.prose.md`,
    timestamp: ts,
    participant_id: "us-a7f3",
    kind: "prose",
    payload: {
      content,
      append_to: targetFile,
      mode: "comment",
      lines: [1, 1],
    },
  };
}

const ARBITRARY = arbitraryProse("20260523T100000Z", "Thinking...");
const TOOL = tool("20260523T100001Z", "Bash");
const CONCLUDE = concludingProse("20260523T100002Z", "Done.");

function resetWithEvents(events: AnyEventRecord[]): void {
  useStore.setState({
    token: null,
    sessions: [SESSION],
    currentSessionId: SESSION.id,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events,
    composeMode: "message",
    commentTarget: null,
    focusedCommentId: null,
    composeDraft: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    viewModeBySession: {},
    activeModal: null,
    activePopover: { key: null, anchorRect: null },
    logFilter: DEFAULT_FILTER,
  });
}

describe("Feed — projectFeed + ArbitraryGroupCard integration", () => {
  beforeEach(() => {
    resetWithEvents([ARBITRARY, TOOL, CONCLUDE]);
  });
  afterEach(() => {
    cleanup();
  });

  test("renders an arbitrary group followed by the concluding prose", () => {
    const { container } = render(<Feed />);
    /* Concluding prose is its own card, visible immediately. */
    expect(screen.getByText("Done.")).toBeInTheDocument();
    /* Concluded group is collapsed by default. Its compact preview may show
       snippets, but the full child cards remain unmounted. */
    expect(container.querySelector(".toolbox-body")).toBeNull();
    /* The group header shows the participant display name + tool count. */
    const groupHeader = container.querySelector(".tb-summary");
    expect(groupHeader).not.toBeNull();
    expect(groupHeader).toHaveTextContent("Claude");
    expect(groupHeader).toHaveTextContent("1 tool");
  });

  test("group header is a toggle button (collapsed by default when concluded)", () => {
    render(<Feed />);
    const toggle = screen.getByRole("button", { name: /toggle group/i });
    expect(toggle).toBeInTheDocument();
  });

  test("renders comment activity in everything and conversation views", () => {
    const anchor = namedProse("20260523T100010Z", "First target line");
    const comment = commentProse("20260523T100011Z", "Please expand this", anchor.filename);
    resetWithEvents([anchor, comment]);

    const { rerender } = render(<Feed />);
    expect(
      screen.getByRole("button", { name: /you commented on launch plan/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Please expand this/i)).toBeInTheDocument();

    useStore.setState({ viewMode: "conversation" });
    rerender(<Feed />);
    expect(
      screen.getByRole("button", { name: /you commented on launch plan/i }),
    ).toBeInTheDocument();
  });

  test("document view keeps comment activity out of the feed", () => {
    const anchor = namedProse("20260523T100020Z", "First target line");
    const comment = commentProse("20260523T100021Z", "Please expand this", anchor.filename);
    resetWithEvents([anchor, comment]);
    useStore.setState({ viewMode: "document" });

    render(<Feed />);
    expect(
      screen.queryByRole("button", { name: /you commented on launch plan/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Launch plan")).toBeInTheDocument();
  });
});
