import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ArbitraryGroupCard } from "./ArbitraryGroupCard";
import type { ArbitraryGroup } from "../feed/projectFeed";
import type { AnyEventRecord } from "@f-mark/shared";

afterEach(cleanup);

function prose(content: string, ts: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.prose.md`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "prose",
    payload: { content, arbitrary: true },
  };
}
function tool(name: string, ts: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.tool-use.json`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "tool-use",
    payload: { tool_name: name, tool_use_id: "x", input: {}, success: true },
  };
}

function makeGroup(over: Partial<ArbitraryGroup> = {}): ArbitraryGroup {
  return {
    type: "group",
    participant_id: "ag-claude",
    items: [prose("hmm", "20260523T100000Z"), tool("Bash", "20260523T100002Z")],
    status: "streaming",
    toolCount: 1,
    timeRangeStart: "20260523T100000Z",
    timeRangeEnd: "20260523T100002Z",
    ...over,
  };
}

describe("<ArbitraryGroupCard>", () => {
  it("is OPEN by default when status=streaming", () => {
    render(<ArbitraryGroupCard group={makeGroup()} now={new Date("2026-05-23T10:00:05Z")} />);
    expect(screen.getByText("hmm")).toBeInTheDocument();
    expect(screen.getByText(/Bash/)).toBeInTheDocument();
  });

  it("is COLLAPSED by default when status=concluded", () => {
    render(<ArbitraryGroupCard group={makeGroup({ status: "concluded" })} now={new Date("2026-05-23T10:00:05Z")} />);
    expect(screen.queryByText("hmm")).not.toBeInTheDocument();
  });

  it("is COLLAPSED by default when status=ended", () => {
    render(<ArbitraryGroupCard group={makeGroup({ status: "ended" })} now={new Date("2026-05-23T10:00:05Z")} />);
    expect(screen.queryByText("hmm")).not.toBeInTheDocument();
  });

  it("title shows tool count", () => {
    render(<ArbitraryGroupCard group={makeGroup({ toolCount: 3 })} now={new Date()} />);
    expect(screen.getByText(/3 tools?/)).toBeInTheDocument();
  });

  it("title shows time range start→end when concluded", () => {
    render(<ArbitraryGroupCard group={makeGroup({ status: "concluded" })} now={new Date()} />);
    // 2s elapsed between start and end
    expect(screen.getByText(/2\s*s|2s/)).toBeInTheDocument();
  });

  it("title shows elapsed-since-start when streaming", () => {
    const now = new Date("2026-05-23T10:01:00Z"); // 60s after start
    render(<ArbitraryGroupCard group={makeGroup({ status: "streaming" })} now={now} />);
    expect(screen.getByText(/1\s*min|60\s*s/)).toBeInTheDocument();
  });

  it("clicking the header toggles open/closed", () => {
    render(<ArbitraryGroupCard group={makeGroup({ status: "concluded" })} now={new Date()} />);
    fireEvent.click(screen.getByRole("button", { name: /toggle group/i }));
    expect(screen.getByText("hmm")).toBeInTheDocument();
  });
});
