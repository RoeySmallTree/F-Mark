/* Part 3 — "added to document" affordance at the Feed level.

   A block appended to a named anchor that sits earlier in the timeline is
   folded into that anchor's card and vanishes from its own slot. The feed
   must (a) drop a coalesced "Added to <doc> — jump ↑" stub at the block's
   slot, (b) NOT do so when the block lands right under its anchor (same-turn
   doc building), and (c) relight the anchor's unread dot. */

import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent } from "@testing-library/react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { Feed } from "../../src/shell/Feed.js";
import { useStore } from "../../src/state/store.js";
import type { SessionMeta } from "../../src/api/client.js";
import { DEFAULT_FILTER } from "../../src/popovers/log-filter-types.js";
import { renderWithAgentSpawn as render } from "../agentSpawnProvider.js";

const SESSION: SessionMeta = {
  id: "s-consumed-stub",
  slug: "consumed-stub",
  created_at: "2026-05-22T10:00:00Z",
};

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-claude": { kind: "agent", name: "Claude", color: "#b86a1f" },
};

const ANCHOR_TS = "20260101T100000Z";
const ANCHOR_FILE = `${ANCHOR_TS}_ag-claude.prose.md`;
const MID_FILE = "20260101T110000Z_ag-claude.prose.md";
const LATE_TS = "20260101T120000Z";
const LATE_FILE = `${LATE_TS}_ag-claude.prose.md`;

function anchor(ts: string, name: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.prose.md`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "prose",
    payload: { name, content: "" } as AnyEventRecord["payload"],
  };
}
function message(ts: string, content: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.prose.md`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "prose",
    payload: { content } as AnyEventRecord["payload"],
  };
}
function block(ts: string, appendTo: string, content: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.prose.md`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "prose",
    payload: { content, append_to: appendTo } as AnyEventRecord["payload"],
  };
}

function seed(events: AnyEventRecord[], lastSeen?: string): void {
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
    lastSeenBySession: lastSeen === undefined ? {} : { [SESSION.id]: lastSeen },
  });
}

describe("Feed — consumed-block stub", () => {
  afterEach(() => cleanup());

  test("a block appended to an earlier anchor renders an 'Added to <doc>' stub", () => {
    seed([
      anchor(ANCHOR_TS, "Sessions List Redesign"),
      message("20260101T110000Z", "some other work"),
      block(LATE_TS, ANCHOR_FILE, "the machined-list brief"),
    ]);

    const { container } = render(<Feed />);

    const stub = container.querySelector(".feed-consumed-stub");
    expect(stub).not.toBeNull();
    expect(stub!.textContent).toContain("Added to");
    expect(stub!.textContent).toContain("Sessions List Redesign");
    // The stub carries the block's read key; the loose block card is gone.
    expect(
      container.querySelector(`[data-feed-read-key="${LATE_FILE}"]`),
    ).not.toBeNull();
  });

  test("a same-turn append (immediately after its anchor) shows no stub", () => {
    seed([
      anchor(ANCHOR_TS, "Doc"),
      block("20260101T100001Z", ANCHOR_FILE, "section 1"),
    ]);

    const { container } = render(<Feed />);

    expect(container.querySelector(".feed-consumed-stub")).toBeNull();
  });

  test("clicking the stub flashes the live anchor card", () => {
    seed([
      anchor(ANCHOR_TS, "Redesign Doc"),
      message("20260101T110000Z", "other work"),
      block(LATE_TS, ANCHOR_FILE, "the brief"),
    ]);

    const { container } = render(<Feed />);
    const stubButton = container.querySelector<HTMLElement>(
      ".feed-consumed-stub",
    );
    const anchorRow = container.querySelector(
      `[data-event-filename="${ANCHOR_FILE}"]`,
    );
    expect(stubButton).not.toBeNull();
    expect(anchorRow!.classList.contains("feed-anchor-flash")).toBe(false);

    fireEvent.click(stubButton!);

    expect(anchorRow!.classList.contains("feed-anchor-flash")).toBe(true);
  });

  test("appending to a previously-read anchor relights its unread dot", () => {
    // Read up to the mid message; the late append should relight the anchor.
    seed(
      [
        anchor(ANCHOR_TS, "Doc"),
        message("20260101T110000Z", "some other work"),
        block(LATE_TS, ANCHOR_FILE, "late addition"),
      ],
      MID_FILE,
    );

    const { container } = render(<Feed />);

    const anchorRow = container.querySelector(
      `[data-event-filename="${ANCHOR_FILE}"]`,
    );
    expect(anchorRow).not.toBeNull();
    expect(anchorRow!.classList.contains("is-unread")).toBe(true);
    // The mid message, already read, stays quiet.
    const midRow = container.querySelector(
      `[data-feed-read-key="${MID_FILE}"]`,
    );
    expect(midRow!.classList.contains("is-unread")).toBe(false);
  });
});
