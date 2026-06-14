import { describe, it, expect, afterEach, beforeAll } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { ArbitraryGroupCard } from "./ArbitraryGroupCard";
import type { ArbitraryGroup } from "../feed/projectFeed";
import type { AnyEventRecord, Participant } from "@f-mark/shared";

afterEach(cleanup);

beforeAll(() => {
  if (typeof Range !== "undefined" && Range.prototype.getClientRects === undefined) {
    Range.prototype.getClientRects = function getClientRects() {
      return [] as unknown as DOMRectList;
    };
  }
});

const PARTICIPANTS: Record<string, Participant> = {
  "ag-claude": { kind: "agent", name: "Azrok", color: "#3b82f6" },
};

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
function accessRequest(ts: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.access-request.json`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "access-request",
    payload: {
      schema: "fmark.access-request.v1",
      request_id: "req_1",
      status: "open",
      request_type: "permission",
      runtime_id: "claude",
      hook_event_name: "PermissionRequest",
      title: "Approve tool use",
      response_channel: "hook",
      created_at: "2026-06-09T10:00:00Z",
    },
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
    expect(screen.getByText("Bash", { selector: ".tool-type" })).toBeInTheDocument();
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

  it("separates the agent title from the right-side clock status metadata", () => {
    render(
      <ArbitraryGroupCard
        group={makeGroup({ toolCount: 3 })}
        participants={PARTICIPANTS}
        now={new Date("2026-05-23T10:00:05Z")}
      />,
    );

    const header = screen.getByRole("button", { name: /toggle group/i });
    const title = header.querySelector(".tb-title");
    const status = header.querySelector(".tb-status");
    expect(title).not.toBeNull();
    expect(status).not.toBeNull();
    expect(title).toHaveTextContent("Azrok");
    expect(title).not.toHaveTextContent("3 tools");
    expect(within(status as HTMLElement).getByText("5 s")).toBeInTheDocument();
    expect(within(header).getByText("3 tools")).toBeInTheDocument();
  });

  it("title resolves the participant display name and keeps the raw id as detail", () => {
    render(
      <ArbitraryGroupCard
        group={makeGroup({ status: "ended" })}
        participants={PARTICIPANTS}
        now={new Date("2026-05-23T10:00:05Z")}
      />,
    );
    const toggle = screen.getByRole("button", { name: /toggle group/i });
    expect(toggle).toHaveTextContent("Azrok");
    expect(toggle).not.toHaveTextContent("ag-claude");
    expect(screen.getByTitle("ag-claude")).toBeInTheDocument();
  });

  it("falls back to the participant id when the registry is missing it", () => {
    render(
      <ArbitraryGroupCard
        group={makeGroup({ status: "ended" })}
        now={new Date("2026-05-23T10:00:05Z")}
      />,
    );
    expect(screen.getByRole("button", { name: /toggle group/i })).toHaveTextContent(
      "ag-claude",
    );
  });

  it("title shows approval count", () => {
    render(
      <ArbitraryGroupCard
        group={makeGroup({
          items: [
            prose("hmm", "20260523T100000Z"),
            tool("Bash", "20260523T100002Z"),
            accessRequest("20260523T100003Z"),
          ],
          accessRequestCount: 1,
        })}
        now={new Date()}
      />,
    );
    expect(screen.getByText(/1 approval/)).toBeInTheDocument();
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

  it("never renders NaN for malformed live timing and shows a working fallback", () => {
    render(
      <ArbitraryGroupCard
        group={makeGroup({
          timeRangeStart: "not-a-date",
          timeRangeEnd: "also-not-a-date",
          status: "streaming",
          toolCount: 1,
        })}
        participants={PARTICIPANTS}
        now={new Date("2026-05-23T10:01:00Z")}
      />,
    );
    const header = screen.getByRole("button", { name: /toggle group/i });
    expect(header).not.toHaveTextContent("NaN");
    expect(header).toHaveTextContent("working");
    expect(header).toHaveTextContent("1 tool");
    expect(header.querySelector(".run-dot")).not.toBeNull();
  });

  it("omits invalid completed timing instead of rendering NaN", () => {
    render(
      <ArbitraryGroupCard
        group={makeGroup({
          status: "ended",
          timeRangeStart: undefined as unknown as string,
          timeRangeEnd: "broken",
          toolCount: 1,
        })}
        participants={PARTICIPANTS}
        now={new Date("2026-05-23T10:01:00Z")}
      />,
    );
    const header = screen.getByRole("button", { name: /toggle group/i });
    expect(header).not.toHaveTextContent("NaN");
    expect(header).not.toHaveTextContent("working");
    expect(header).toHaveTextContent("1 tool");
  });

  it("clicking the header toggles open/closed", () => {
    render(<ArbitraryGroupCard group={makeGroup({ status: "concluded" })} now={new Date()} />);
    fireEvent.click(screen.getByRole("button", { name: /toggle group/i }));
    expect(screen.getByText("hmm")).toBeInTheDocument();
  });
});
