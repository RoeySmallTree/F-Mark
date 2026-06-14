import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ForkLinkEventRecord, Participant } from "@f-mark/shared";
import { ForkLinkCard } from "../../src/cards/ForkLinkCard.js";
import { useStore } from "../../src/state/store.js";
import { DEFAULT_FILTER } from "../../src/popovers/log-filter-types.js";

const PARTICIPANTS: Record<string, Participant> = {
  "sys-fork": { kind: "sys", name: "Fork", color: "#71717a" },
};

function makeEvent(direction: "from" | "to", otherSlug: string, otherPath?: string): ForkLinkEventRecord {
  return {
    filename: "20260529T120000Z_sys-fork.fork-link.json",
    timestamp: "20260529T120000Z",
    participant_id: "sys-fork",
    kind: "fork-link",
    payload: {
      schema: "fmark.fork-link.v1",
      direction,
      other_session_id: "2026-05-29-other",
      other_session_slug: otherSlug,
      ...(otherPath !== undefined ? { other_path: otherPath } : {}),
    },
  };
}

function resetStore(activePath: string | null): void {
  useStore.setState({
    token: null,
    sessions: [],
    currentSessionId: null,
    participants: PARTICIPANTS,
    currentUserId: null,
    events: [],
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
    lastSeenBySession: {},
    activePath,
  });
}

describe("ForkLinkCard", () => {
  beforeEach(() => {
    resetStore("/home/user/repo-a");
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('"from" direction renders "Forked from <slug>"', () => {
    render(<ForkLinkCard event={makeEvent("from", "parent")} />);
    expect(screen.getByText(/Forked from/)).toBeInTheDocument();
    expect(screen.getByText("parent")).toBeInTheDocument();
  });

  test('"to" direction renders "Forked to <slug>"', () => {
    render(<ForkLinkCard event={makeEvent("to", "child")} />);
    expect(screen.getByText(/Forked to/)).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  test("same-path click: setCurrentSession only, no setActivePath", async () => {
    const setCurrentSession = vi.fn();
    useStore.setState({ setCurrentSession });
    const user = userEvent.setup();
    render(<ForkLinkCard event={makeEvent("to", "child")} />);
    await user.click(screen.getByRole("button"));
    expect(setCurrentSession).toHaveBeenCalledWith("2026-05-29-other");
  });

  test("button is keyboard focusable", () => {
    render(<ForkLinkCard event={makeEvent("from", "x")} />);
    const btn = screen.getByRole("button");
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });
});
