import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup } from "@testing-library/react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { Feed } from "../../src/shell/Feed.js";
import { LAST_SEEN_STORAGE_KEY, useStore } from "../../src/state/store.js";
import type { SessionMeta } from "../../src/api/client.js";
import { DEFAULT_FILTER } from "../../src/popovers/log-filter-types.js";
import { renderWithAgentSpawn } from "../agentSpawnProvider.js";

const SESSION: SessionMeta = {
  id: "2026-06-16-follow-tail",
  slug: "follow-tail",
  created_at: "2026-06-16T10:00:00Z",
};

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-claude": {
    kind: "agent",
    name: "Claude",
    color: "#b86a1f",
    active_session: SESSION.id,
  },
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

function toolUse(ts: string, name: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.tool-use.json`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "tool-use",
    payload: {
      tool_name: name,
      tool_use_id: `tu-${ts}`,
      input: {},
      success: true,
    },
  };
}

const STREAM_START = arbitraryProse("20260616T100000Z", "starting");
const STREAM_TOOL = toolUse("20260616T100001Z", "Bash");

function resetWithEvents(events: AnyEventRecord[]): void {
  const lastSeen = { [SESSION.id]: STREAM_START.filename };
  globalThis.localStorage?.setItem(
    LAST_SEEN_STORAGE_KEY,
    JSON.stringify(lastSeen),
  );
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
    lastSeenBySession: lastSeen,
    followMode: true,
    scrollToBottomTick: 0,
  });
}

describe("Feed follow mode", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    resetWithEvents([STREAM_START]);
  });

  afterEach(() => {
    cleanup();
  });

  test("tracks streaming group growth even when the rendered row count stays flat", async () => {
    const { container } = renderWithAgentSpawn(<Feed />);
    await act(async () => {
      await Promise.resolve();
    });

    const root = container.querySelector(".feed-scroll") as
      | (HTMLDivElement & { scrollTo: ReturnType<typeof vi.fn> })
      | null;
    expect(root).not.toBeNull();
    const scrollTo = vi.fn();
    Object.defineProperty(root!, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    Object.defineProperty(root!, "scrollHeight", {
      configurable: true,
      value: 2400,
    });

    await act(async () => {
      useStore.setState({ events: [STREAM_START, STREAM_TOOL] });
      await Promise.resolve();
    });

    expect(container.querySelectorAll("[data-event-filename]")).toHaveLength(1);
    expect(scrollTo).toHaveBeenCalledWith({
      top: 2400,
      behavior: "smooth",
    });
  });
});
