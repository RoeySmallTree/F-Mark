/* Tests for the Phase 15 empty-state polish — verifies each panel surfaces
   the spec-required copy when there's nothing to show. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Sessions } from "../../src/panels/Sessions.js";
import { Search } from "../../src/panels/Search.js";
import { Agents } from "../../src/modals/settings/Agents.js";
import { useStore } from "../../src/state/store.js";
import { jsonResponse, resetStore } from "../cards/_helpers.js";

describe("Empty-state copy", () => {
  beforeEach(() => {
    resetStore();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("Sessions panel — 'No sessions yet. Press + New.' when empty", async () => {
    useStore.setState({ sessions: [], currentSessionId: null });
    render(<Sessions />);
    await waitFor(() => {
      expect(
        screen.getByText(/No sessions yet\. Press \+ New\./i),
      ).toBeInTheDocument();
    });
  });

  test("Search panel — instructs the user to type when query is empty", async () => {
    render(<Search />);
    await waitFor(() => {
      expect(
        screen.getByText(/Type to search across sessions/i),
      ).toBeInTheDocument();
    });
  });

  test("Agents (Settings) — shows the loaded empty connected-agents state", async () => {
    // Reset to a state with only a user participant — no agents.
    useStore.setState({
      participants: { "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" } },
      events: [],
    });
    render(<Agents />);
    await waitFor(() => {
      expect(
        screen.getByText(/No connected agents right now\./i),
      ).toBeInTheDocument();
    });
  });
});
