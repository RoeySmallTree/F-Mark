import { describe, expect, test } from "vitest";
import type { AnyEventRecord } from "@f-mark/shared";
import { projectedItems } from "./projectItems";

const P = "ag-claude";

function prose(id: string, content = "x"): AnyEventRecord {
  return {
    filename: `${id}.prose.md`,
    timestamp: id,
    participant_id: P,
    kind: "prose",
    payload: { content, arbitrary: true },
  } as AnyEventRecord;
}

function tool(id: string): AnyEventRecord {
  return {
    filename: `${id}.tool-use.json`,
    timestamp: id,
    participant_id: P,
    kind: "tool-use",
    payload: { tool_name: "Bash", tool_use_id: id, input: {}, success: true },
  } as AnyEventRecord;
}

function subRun(id: string, cid: string): AnyEventRecord {
  return {
    filename: `${id}.subagent-run.json`,
    timestamp: id,
    participant_id: P,
    kind: "subagent-run",
    payload: { correlation_id: cid },
  } as AnyEventRecord;
}

function subOut(id: string, cid: string): AnyEventRecord {
  return {
    filename: `${id}.subagent-output.json`,
    timestamp: id,
    participant_id: P,
    kind: "subagent-output",
    payload: { correlation_id: cid },
  } as AnyEventRecord;
}

describe("projectedItems prose runs", () => {
  test("joins consecutive message prose into one run", () => {
    const out = projectedItems([prose("a", "Hello "), prose("b", "world")]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "prose-run", content: "Hello world" });
  });

  test("a lone prose is a single run keyed by its filename", () => {
    const out = projectedItems([prose("a", "solo")]);
    expect(out).toEqual([
      { type: "prose-run", key: "a.prose.md", events: [prose("a", "solo")], content: "solo" },
    ]);
  });

  test("a tool-use breaks the run, with leading and trailing prose preserved", () => {
    const out = projectedItems([prose("a"), tool("b"), prose("c")]);
    expect(out.map((item) => item.type)).toEqual([
      "prose-run",
      "event",
      "prose-run",
    ]);
  });

  test("a consumed subagent-output between prose breaks the run", () => {
    // subRun + subOut share correlation key "k"; the first emits the subagent
    // item and consumes both. The consumed subOut still separates prose c from
    // prose e in the stream — they must not merge into one document.
    const items = [
      prose("a"),
      subRun("b", "k"),
      prose("c"),
      subOut("d", "k"),
      prose("e"),
    ];
    const out = projectedItems(items);
    expect(out.map((item) => item.type)).toEqual([
      "prose-run",
      "subagent",
      "prose-run",
      "prose-run",
    ]);
  });
});
