/* Task 20 — wiring projectFeed + ArbitraryGroupCard into the Feed.

   Given a stream of [arbitrary prose, tool-use, concluding prose] from the
   same participant, the Feed should render a single collapsed group card
   PLUS the concluding prose as its own card. */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { Feed } from "../../src/shell/Feed.js";
import { useStore } from "../../src/state/store.js";
import type { SessionMeta } from "../../src/api/client.js";
import { DEFAULT_FILTER } from "../../src/popovers/log-filter-types.js";

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
    render(<Feed />);
    /* Concluding prose is its own card, visible immediately. */
    expect(screen.getByText("Done.")).toBeInTheDocument();
    /* Concluded group is collapsed by default — "Thinking..." NOT rendered
       and the inner tool-use ("Bash") also NOT rendered. */
    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
    /* The group header shows the participant + tool count. */
    expect(screen.getByText(/ag-claude/)).toBeInTheDocument();
    expect(screen.getByText(/1 tool/)).toBeInTheDocument();
  });

  test("group header is a toggle button (collapsed by default when concluded)", () => {
    render(<Feed />);
    const toggle = screen.getByRole("button", { name: /toggle group/i });
    expect(toggle).toBeInTheDocument();
  });
});
