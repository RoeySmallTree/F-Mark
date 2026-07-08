import type { AnyEventRecord, Participant } from "@f-mark/shared";
import type { ArbitraryGroup } from "../../feed/projectFeed";

export const PARTICIPANTS: Record<string, Participant> = {
  "ag-claude": { kind: "agent", name: "Azrok", color: "#3b82f6" },
};

export const DEFAULT_NOW = new Date("2026-05-23T10:00:05Z");
export const LIVE_TIMING_NOW = new Date("2026-05-23T10:01:00Z");

export function prose(content: string, ts: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.prose.md`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "prose",
    payload: { content, arbitrary: true },
  };
}

export function tool(name: string, ts: string): AnyEventRecord {
  return {
    filename: `${ts}_ag-claude.tool-use.json`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "tool-use",
    payload: { tool_name: name, tool_use_id: "x", input: {}, success: true },
  };
}

function bashTool(index: number): AnyEventRecord {
  const ts = bashToolTimestamp(index);
  return {
    filename: `${ts}_ag-claude.tool-use.json`,
    timestamp: ts,
    participant_id: "ag-claude",
    kind: "tool-use",
    payload: {
      tool_name: "Bash",
      tool_use_id: `x-${index}`,
      input: { command: `cmd${index} --flag` },
      result: { stdout: `done ${index}` },
      success: true,
    },
  };
}

export function accessRequest(ts: string): AnyEventRecord {
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

export function accessResponse(ts: string): AnyEventRecord {
  return {
    filename: `${ts}_us-a7f3.access-response.json`,
    timestamp: ts,
    participant_id: "us-a7f3",
    kind: "access-response",
    payload: {
      schema: "fmark.access-response.v1",
      request_id: "req_1",
      decision: "approve",
      status: "approved",
      delivered: true,
      delivery: "hook",
      responded_at: "2026-05-23T10:00:35.000Z",
    },
  };
}

export function makeGroup(over: Partial<ArbitraryGroup> = {}): ArbitraryGroup {
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

export function makeBashToolGroup(indices: number[], over: Partial<ArbitraryGroup> = {}) {
  return makeGroup({
    items: indices.map((index) => bashTool(index)),
    toolCount: indices.length,
    timeRangeStart: bashToolTimestamp(indices[0] ?? 1),
    timeRangeEnd: bashToolTimestamp(indices[indices.length - 1] ?? 1),
    status: "streaming",
    ...over,
  });
}

export function makeOpenApprovalItems() {
  return [
    prose("hmm", "20260523T100000Z"),
    tool("Bash", "20260523T100002Z"),
    accessRequest("20260523T100005Z"),
  ];
}

export function makeAnsweredApprovalItems() {
  return [...makeOpenApprovalItems(), tool("Read", "20260523T100040Z")];
}

function bashToolTimestamp(index: number) {
  return `20260523T10000${index}Z`;
}
