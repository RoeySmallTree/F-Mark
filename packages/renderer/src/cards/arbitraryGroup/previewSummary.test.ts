import { describe, expect, it } from "vitest";
import { buildPreviewSummary } from "./previewSummary.js";
import { RENDER_ITEM_TYPES, type RenderItem } from "./types.js";

describe("buildPreviewSummary", () => {
  it("groups tools by name and keeps the first filename for drill-in", () => {
    const items: RenderItem[] = [
      {
        type: RENDER_ITEM_TYPES.event,
        event: {
          filename: "a.json",
          timestamp: "t1",
          participant_id: "ag",
          kind: "tool-use",
          payload: {
            tool_name: "Bash",
            tool_use_id: "1",
            input: { command: "cmd1" },
            success: true,
          },
        },
      },
      {
        type: RENDER_ITEM_TYPES.event,
        event: {
          filename: "b.json",
          timestamp: "t2",
          participant_id: "ag",
          kind: "tool-use",
          payload: {
            tool_name: "Bash",
            tool_use_id: "2",
            input: { command: "cmd2" },
            success: true,
          },
        },
      },
      {
        type: RENDER_ITEM_TYPES.event,
        event: {
          filename: "c.json",
          timestamp: "t3",
          participant_id: "ag",
          kind: "tool-use",
          payload: {
            tool_name: "Read",
            tool_use_id: "3",
            input: { file_path: "a.ts" },
            success: true,
          },
        },
      },
    ];

    const summary = buildPreviewSummary(items);
    expect(summary.tools).toEqual([
      expect.objectContaining({ key: "a.json", name: "Bash", count: 2 }),
      expect.objectContaining({ key: "c.json", name: "Read", count: 1 }),
    ]);
  });

  it("prefers latest thinking over tool text for the narrative line", () => {
    const items: RenderItem[] = [
      {
        type: RENDER_ITEM_TYPES.proseRun,
        key: "p1",
        events: [],
        content: "first thought",
      },
      {
        type: RENDER_ITEM_TYPES.event,
        event: {
          filename: "t1.json",
          timestamp: "t1",
          participant_id: "ag",
          kind: "tool-use",
          payload: {
            tool_name: "Bash",
            tool_use_id: "1",
            input: {},
            success: true,
          },
        },
      },
      {
        type: RENDER_ITEM_TYPES.proseRun,
        key: "p2",
        events: [],
        content: "latest thought wins",
      },
    ];

    expect(buildPreviewSummary(items).narrativeText).toBe("latest thought wins");
  });
});
