import { describe, it, expect } from "vitest";
import { projectFeed, type FeedItem } from "./projectFeed";
import type { AnyEventRecord } from "@f-mark/shared";

function prose(participant: string, content: string, arbitrary?: boolean, ts = "20260523T100000Z"): AnyEventRecord {
  return {
    filename: `${ts}_${participant}.prose.md`,
    timestamp: ts,
    participant_id: participant,
    kind: "prose",
    payload: { content, ...(arbitrary !== undefined ? { arbitrary } : {}) },
  };
}

function tool(participant: string, name: string, ts = "20260523T100001Z"): AnyEventRecord {
  return {
    filename: `${ts}_${participant}.tool-use.json`,
    timestamp: ts,
    participant_id: participant,
    kind: "tool-use",
    payload: { tool_name: name, tool_use_id: "tu_1", input: {}, success: true },
  };
}

function accessRequest(participant: string, ts = "20260523T100002Z"): AnyEventRecord {
  return {
    filename: `${ts}_${participant}.access-request.json`,
    timestamp: ts,
    participant_id: participant,
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

function choices(participant: string, ts = "20260523T100002Z"): AnyEventRecord {
  return {
    filename: `${ts}_${participant}.choices.json`,
    timestamp: ts,
    participant_id: participant,
    kind: "choices",
    payload: {
      id: "mock-options",
      question: "Pick a mock",
      options: [{ id: "a", label: "A" }],
      multi: false,
    },
  };
}

function html(participant: string, ts = "20260523T100002Z"): AnyEventRecord {
  return {
    filename: `${ts}_${participant}.html`,
    timestamp: ts,
    participant_id: participant,
    kind: "html",
    payload: { id: "preview-1", title: "Preview" },
  };
}

function turnEnd(participant: string, ts = "20260523T100005Z"): AnyEventRecord {
  return {
    filename: `${ts}_${participant}.turn-end.json`,
    timestamp: ts,
    participant_id: participant,
    kind: "turn-end",
    payload: {},
  };
}

describe("projectFeed", () => {
  it("passes through deliberate prose unchanged", () => {
    const ev = [prose("ag-claude", "hello")];
    const out = projectFeed(ev);
    expect(out).toEqual<FeedItem[]>([{ type: "event", event: ev[0]! }]);
  });

  it("wraps consecutive arbitrary prose + tool-use into a single group", () => {
    const ev = [
      prose("ag-claude", "I'll search.", true, "20260523T100000Z"),
      tool("ag-claude", "Bash", "20260523T100001Z"),
      prose("ag-claude", "Done.", false, "20260523T100002Z"),
    ];
    const out = projectFeed(ev);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      type: "group",
      participant_id: "ag-claude",
      items: [ev[0], ev[1]],
      status: "concluded",
      toolCount: 1,
      timeRangeStart: "20260523T100000Z",
      timeRangeEnd: "20260523T100001Z",
    });
    expect(out[1]).toEqual({ type: "event", event: ev[2] });
  });

  it("group remains 'streaming' when no concluding prose exists yet", () => {
    const ev = [
      prose("ag-claude", "Thinking...", true, "20260523T100000Z"),
      tool("ag-claude", "Read", "20260523T100001Z"),
    ];
    const out = projectFeed(ev);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "group", status: "streaming" });
  });

  it("group ends on different participant's event", () => {
    const ev = [
      prose("ag-claude", "I'll search.", true),
      tool("ag-claude", "Bash"),
      prose("us-roey", "hold on", false),
    ];
    const out = projectFeed(ev);
    expect(out).toHaveLength(2);
    expect(out[0]!.type).toBe("group");
    expect(out[1]).toEqual({ type: "event", event: ev[2]! });
  });

  it("group concluded by turn-end (no follow-up prose) → status=ended", () => {
    const ev = [
      prose("ag-claude", "Thinking", true),
      tool("ag-claude", "Bash"),
      turnEnd("ag-claude"),
    ];
    const out = projectFeed(ev);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: "group", status: "ended" });
    expect(out[1]).toEqual({ type: "event", event: ev[2] });
  });

  it("keeps access requests inside same-participant mid-turn groups", () => {
    const ev = [
      prose("ag-claude", "Thinking", true, "20260523T100000Z"),
      tool("ag-claude", "Bash", "20260523T100001Z"),
      accessRequest("ag-claude", "20260523T100002Z"),
      turnEnd("ag-claude", "20260523T100003Z"),
    ];
    const out = projectFeed(ev);
    expect(out).toHaveLength(2);
    expect(out[0]!.type).toBe("group");
    if (out[0]!.type !== "group") return;
    expect(out[0]!.items.map((event) => event.kind)).toEqual([
      "prose",
      "tool-use",
      "access-request",
    ]);
    expect(out[0]!.accessRequestCount).toBe(1);
    expect(out[0]!.status).toBe("ended");
    expect(out[1]).toEqual({ type: "event", event: ev[3] });
  });

  it("two separate groups when participant emits two distinct turns", () => {
    const ev = [
      prose("ag-claude", "first", true, "20260523T100000Z"),
      prose("ag-claude", "done", false, "20260523T100001Z"),
      prose("ag-claude", "second", true, "20260523T100100Z"),
      tool("ag-claude", "Read", "20260523T100101Z"),
    ];
    const out = projectFeed(ev);
    // group + concluding + group
    expect(out).toHaveLength(3);
    expect(out[0]!.type).toBe("group");
    expect(out[1]!.type).toBe("event"); // concluding "done"
    expect(out[2]).toMatchObject({ type: "group", status: "streaming" });
  });

  it("a single arbitrary prose still becomes a group (so the box is opened immediately)", () => {
    const ev = [prose("ag-claude", "Thinking...", true)];
    const out = projectFeed(ev);
    expect(out).toEqual<FeedItem[]>([
      expect.objectContaining({ type: "group", status: "streaming", toolCount: 0, items: ev }),
    ]);
  });

  it("closes the current group before same-participant standalone events", () => {
    const ev = [
      prose("ag-claude", "I'll make mocks.", true, "20260523T100000Z"),
      tool("ag-claude", "Read", "20260523T100001Z"),
      choices("ag-claude", "20260523T100002Z"),
      prose("ag-claude", "Checking one more thing.", true, "20260523T100003Z"),
      tool("ag-claude", "Bash", "20260523T100004Z"),
    ];
    const out = projectFeed(ev);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({
      type: "group",
      participant_id: "ag-claude",
      items: [ev[0], ev[1]],
      status: "concluded",
    });
    expect(out[1]).toEqual({ type: "event", event: ev[2] });
    expect(out[2]).toMatchObject({
      type: "group",
      participant_id: "ag-claude",
      items: [ev[3], ev[4]],
      status: "streaming",
    });
  });

  it("flow events surface as standalone feed items (not absorbed into arbitrary groups)", () => {
    const events: AnyEventRecord[] = [
      tool("ag-claude", "Bash", "20260523T100000Z"),
      {
        filename: "20260523T100001Z_ag-claude.flow.json",
        timestamp: "20260523T100001Z",
        participant_id: "ag-claude",
        kind: "flow",
        payload: { id: "fl1", nodes: [], edges: [] },
      },
    ];
    const items = projectFeed(events);
    const flowItem = items.find(
      (i) => i.type === "event" && i.event.kind === "flow",
    );
    expect(flowItem).toBeDefined();
  });

  it("places a late pure self-comment before the nearby result it prefaced", () => {
    const ev = [
      html("ag-claude", "20260523T100001Z"),
      prose(
        "ag-claude",
        "Now I'll build the visualization.",
        true,
        "20260523T100002Z",
      ),
    ];
    const out = projectFeed(ev);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      type: "group",
      participant_id: "ag-claude",
      items: [ev[1]],
    });
    expect(out[1]).toEqual({ type: "event", event: ev[0] });
  });

  it("does not reorder later self-comments that are not near the result", () => {
    const ev = [
      html("ag-claude", "20260523T100001Z"),
      prose(
        "ag-claude",
        "Checking another thing.",
        true,
        "20260523T100030Z",
      ),
    ];
    const out = projectFeed(ev);
    expect(out[0]).toEqual({ type: "event", event: ev[0] });
    expect(out[1]).toMatchObject({
      type: "group",
      participant_id: "ag-claude",
      items: [ev[1]],
    });
  });
});

describe("projectFeed — consumed-block stubs", () => {
  const stub = {
    anchorFilename: "20260523T090000Z_ag-c.prose.md",
    docName: "Redesign Doc",
    newestBlockFilename: "20260523T100001Z_ag-c.prose.md",
    blockCount: 1,
  };

  it("emits a stub marker as a standalone row, flushing the buffered group", () => {
    const events = [
      tool("ag-c", "search", "20260523T100000Z"),
      { type: "stub" as const, stub, sortKey: stub.newestBlockFilename },
      prose("ag-c", "done", false, "20260523T100002Z"),
    ];

    const items = projectFeed(events);

    expect(items.map((i) => i.type)).toEqual(["group", "stub", "event"]);
    const stubItem = items[1]!;
    expect(stubItem.type === "stub" && stubItem.stub.docName).toBe(
      "Redesign Doc",
    );
  });
});
