import { describe, it, expectTypeOf } from "vitest";
import type {
  ToolUsePayload,
  ToolUseEventRecord,
  AnyEventRecord,
  EventKind,
} from "@f-mark/shared";

describe("tool-use event types", () => {
  it("ToolUsePayload has the expected shape", () => {
    const p: ToolUsePayload = {
      tool_name: "Bash",
      tool_use_id: "tu_abc",
      input: { command: "ls" },
      result: "file1\nfile2",
      success: true,
      duration_ms: 12,
    };
    expectTypeOf(p.tool_name).toEqualTypeOf<string>();
    expectTypeOf(p.input).toEqualTypeOf<unknown>();
  });

  it("AnyEventRecord includes ToolUseEventRecord", () => {
    const rec = {
      filename: "20260523T100000Z_ag-claude.tool-use.json",
      timestamp: "20260523T100000Z",
      participant_id: "ag-claude",
      kind: "tool-use" as const,
      payload: {
        tool_name: "Bash",
        tool_use_id: "tu_abc",
        input: {},
        success: true,
      },
    } satisfies ToolUseEventRecord;
    // Discriminant-based union membership check. Resolves to `never` if
    // `ToolUseEventRecord` is removed from `AnyEventRecord`, because the
    // catch-all `EventRecord` branch has `kind: EventKind` (broader than
    // `"tool-use"`) and so does not survive `Extract`. The previous form
    // `expectTypeOf<ToolUseEventRecord>().toMatchTypeOf<AnyEventRecord>()`
    // was circular against the catch-all branch and gave false confidence.
    expectTypeOf<Extract<AnyEventRecord, { kind: "tool-use" }>>().toEqualTypeOf<ToolUseEventRecord>();
    // Value-side assignability sanity check.
    expectTypeOf(rec).toMatchTypeOf<AnyEventRecord>();
  });

  it('"tool-use" is a member of EventKind', () => {
    const k: EventKind = "tool-use";
    expectTypeOf(k).toMatchTypeOf<EventKind>();
  });
});
