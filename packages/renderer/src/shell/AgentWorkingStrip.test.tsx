import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentWorkingStrip } from "./AgentWorkingStrip.js";
import { useStore } from "../state/store.js";

function elapsedClock(): HTMLElement {
  const label = screen.getByText("ELAPSED");
  const clock = label.parentElement;
  expect(clock).not.toBeNull();
  return clock!;
}

describe("<AgentWorkingStrip>", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-18T10:00:20.000Z"));
    useStore.setState({
      participants: {
        "ag-codex": { kind: "agent", name: "Codex", color: "#2a7f62" },
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("holds elapsed time at the current approval pause", () => {
    render(
      <AgentWorkingStrip
        agentIds={["ag-codex"]}
        blocked={true}
        turnStartMs={Date.parse("2026-06-18T10:00:00.000Z")}
        approvalPauseStartMs={Date.parse("2026-06-18T10:00:05.000Z")}
        action="is requesting access"
      />,
    );

    expect(elapsedClock()).toHaveTextContent("0:05");
    act(() => {
      vi.setSystemTime(new Date("2026-06-18T10:01:20.000Z"));
      vi.advanceTimersByTime(60_000);
    });
    expect(elapsedClock()).toHaveTextContent("0:05");
  });

  it("resumes from elapsed time minus answered approval waits", () => {
    vi.setSystemTime(new Date("2026-06-18T10:01:20.000Z"));
    render(
      <AgentWorkingStrip
        agentIds={["ag-codex"]}
        blocked={false}
        turnStartMs={Date.parse("2026-06-18T10:00:00.000Z")}
        approvalPausedMs={30_000}
        action="is thinking"
      />,
    );

    expect(elapsedClock()).toHaveTextContent("0:50");
  });
});
