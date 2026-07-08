import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { Feed } from "../../src/shell/Feed.js";
import { useStore } from "../../src/state/store.js";
import type { SessionMeta } from "../../src/api/client.js";
import { DEFAULT_FILTER } from "../../src/popovers/log-filter-types.js";
import { renderWithAgentSpawn } from "../agentSpawnProvider.js";

const SESSION: SessionMeta = {
  id: "2026-06-18-composer-collapse",
  slug: "composer-collapse",
  created_at: "2026-06-18T10:00:00Z",
};

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-codex": { kind: "agent", name: "Codex", color: "#2a7f62" },
};

const EVENT: AnyEventRecord = {
  filename: "20260618T100000Z_ag-codex.prose.md",
  timestamp: "20260618T100000Z",
  participant_id: "ag-codex",
  kind: "prose",
  payload: { content: "Ready." },
};

function resetStore(): void {
  useStore.setState({
    token: null,
    sessions: [SESSION],
    currentSessionId: SESSION.id,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: [EVENT],
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
    lastSeenBySession: { [SESSION.id]: EVENT.filename },
  });
}

describe("Feed composer collapse", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    cleanup();
  });

  test("toggles the composer panel from the nav-adjacent button", async () => {
    const user = userEvent.setup();
    const { container } = renderWithAgentSpawn(<Feed />);

    const dock = container.querySelector(".compose-dock");
    const shell = container.querySelector(".compose-shell");
    expect(dock).not.toBeNull();
    expect(shell).not.toBeNull();
    expect(screen.getByLabelText("Compose message")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse composer" }));

    expect(dock).toHaveClass("is-composer-collapsed");
    expect(shell).toHaveAttribute("aria-hidden", "true");
    expect(shell).toHaveAttribute("inert");
    expect(
      screen.getByRole("button", { name: "Expand composer" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Expand composer" }));

    expect(dock).not.toHaveClass("is-composer-collapsed");
    expect(shell).toHaveAttribute("aria-hidden", "false");
    expect(shell).not.toHaveAttribute("inert");
    expect(
      screen.getByRole("button", { name: "Collapse composer" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Compose message")).toBeInTheDocument();
  });
});
