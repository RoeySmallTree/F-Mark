/* Generic first-open anchor-seeding rule (Feed.tsx restore effect).
   When the user opens a session that has no saved lastSeenBySession
   anchor, the Feed should:
     - Seed the anchor to the highest loaded filename
     - Hide the "X unread" floater
     - Scroll the container to the bottom
   Fork sessions inherit this behavior — there's no fork-specific code
   in the Feed; the rule is generic to "session not seen before". */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { act, cleanup } from "@testing-library/react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { Feed } from "../../src/shell/Feed.js";
import { LAST_SEEN_STORAGE_KEY, useStore } from "../../src/state/store.js";
import type { SessionMeta } from "../../src/api/client.js";
import { DEFAULT_FILTER } from "../../src/popovers/log-filter-types.js";
import { renderWithAgentSpawn } from "../agentSpawnProvider.js";

const SESSION: SessionMeta = {
  id: "2026-05-29-fresh-fork",
  slug: "fresh-fork",
  created_at: "2026-05-29T10:00:00Z",
};

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-claude": { kind: "agent", name: "Claude", color: "#b86a1f" },
};

function prose(ts: string, content: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.prose.md`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "prose",
    payload: { content },
  };
}

const E1 = prose("20260529T100000Z", "one");
const E2 = prose("20260529T100100Z", "two");
const E3 = prose("20260529T100200Z", "three");

function resetWithEvents(events: AnyEventRecord[], lastSeen: Record<string, string>): void {
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
    composeDraft: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    viewModeBySession: {},
    activeModal: null,
    activePopover: { key: null, anchorRect: null },
    logFilter: DEFAULT_FILTER,
    lastSeenBySession: lastSeen,
  });
}

describe("Feed — first-open anchor seeding", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
  });
  afterEach(() => {
    cleanup();
  });

  test("session with no saved anchor: seeds to last filename, no unread", async () => {
    resetWithEvents([E1, E2, E3], {});
    const { container } = renderWithAgentSpawn(<Feed />);
    /* The restore effect runs in a layout effect after first paint; flush
       pending microtasks. */
    await act(async () => {
      await Promise.resolve();
    });
    const state = useStore.getState();
    expect(state.lastSeenBySession[SESSION.id]).toBe(E3.filename);
    // No unread floater should be rendered.
    expect(container.querySelector(".unread-floater")).toBeNull();
  });

  test("session with a saved anchor: anchor is preserved (no first-open seed)", async () => {
    resetWithEvents([E1, E2, E3], { [SESSION.id]: E1.filename });
    renderWithAgentSpawn(<Feed />);
    await act(async () => {
      await Promise.resolve();
    });
    const state = useStore.getState();
    expect(state.lastSeenBySession[SESSION.id]).toBe(E1.filename);
  });
});
