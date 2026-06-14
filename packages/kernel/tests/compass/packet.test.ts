/* compass/packet — verifies that wake packets surface comment-anchor
   metadata so agents can dereference the parent prose without a separate
   fmark_get_inbox call. */

import { describe, expect, it } from "vitest";
import type { AnyEventRecord, ProsePayload } from "@f-mark/shared";
import { buildCompassPacket, buildWakePrompt } from "../../src/compass/packet.js";

function proseEvent(
  filename: string,
  participantId: string,
  payload: Partial<ProsePayload> & { content?: string },
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: participantId,
    kind: "prose",
    payload: { content: "", ...payload } as ProsePayload,
  };
}

describe("buildCompassPacket — comment anchor metadata", () => {
  it("anchor prose (no append_to) leaves append_to/lines/mode undefined on the packet event", () => {
    const event = proseEvent("20260527T100000Z_us-a7f3.prose.md", "us-a7f3", {
      content: "Hello world",
      name: "My anchor",
    });

    const packet = buildCompassPacket({
      sessionId: "sess-1",
      participantId: "ag-claude",
      cursorBefore: null,
      events: [event],
    });

    expect(packet.events).toHaveLength(1);
    const item = packet.events[0]!;
    expect(item.append_to).toBeUndefined();
    expect(item.lines).toBeUndefined();
    expect(item.mode).toBeUndefined();
    expect(item.summary).toBe("Hello world");
  });

  it("comment prose propagates append_to, lines, mode onto the packet event", () => {
    const event = proseEvent("20260527T100100Z_us-a7f3.prose.md", "us-a7f3", {
      content: "fix this typo",
      append_to: "20260527T095800Z_us-a7f3.prose.md",
      mode: "comment",
      lines: [12, 18],
    });

    const packet = buildCompassPacket({
      sessionId: "sess-1",
      participantId: "ag-claude",
      cursorBefore: null,
      events: [event],
    });

    const item = packet.events[0]!;
    expect(item.append_to).toBe("20260527T095800Z_us-a7f3.prose.md");
    expect(item.mode).toBe("comment");
    expect(item.lines).toEqual([12, 18]);
  });

  it("comment summary uses the 'comment on X @a-b: <body>' format", () => {
    const event = proseEvent("20260527T100100Z_us-a7f3.prose.md", "us-a7f3", {
      content: "fix this typo",
      append_to: "20260527T095800Z_us-a7f3.prose.md",
      mode: "comment",
      lines: [12, 18],
    });

    const packet = buildCompassPacket({
      sessionId: "sess-1",
      participantId: "ag-claude",
      cursorBefore: null,
      events: [event],
    });

    expect(packet.events[0]!.summary).toBe(
      "comment on 20260527T095800Z_us-a7f3.prose.md @12-18: fix this typo",
    );
  });

  it("comment without lines still indicates the anchor", () => {
    const event = proseEvent("20260527T100100Z_us-a7f3.prose.md", "us-a7f3", {
      content: "general note",
      append_to: "20260527T095800Z_us-a7f3.prose.md",
      mode: "comment",
    });

    const packet = buildCompassPacket({
      sessionId: "sess-1",
      participantId: "ag-claude",
      cursorBefore: null,
      events: [event],
    });

    expect(packet.events[0]!.summary).toBe(
      "comment on 20260527T095800Z_us-a7f3.prose.md: general note",
    );
    expect(packet.events[0]!.lines).toBeUndefined();
  });

  it("non-prose events do not gain append_to/lines fields", () => {
    const event: AnyEventRecord = {
      filename: "20260527T100200Z_us-a7f3.todo.json",
      timestamp: "20260527T100200Z",
      participant_id: "us-a7f3",
      kind: "todo",
      payload: { id: "td-1", title: "ship it", status: "open" },
    };

    const packet = buildCompassPacket({
      sessionId: "sess-1",
      participantId: "ag-claude",
      cursorBefore: null,
      events: [event],
    });

    const item = packet.events[0]!;
    expect(item.append_to).toBeUndefined();
    expect(item.lines).toBeUndefined();
    expect(item.mode).toBeUndefined();
  });

  it("wake prompt JSON-stringifies the comment-anchor fields", () => {
    const event = proseEvent("20260527T100100Z_us-a7f3.prose.md", "us-a7f3", {
      content: "fix this typo",
      append_to: "20260527T095800Z_us-a7f3.prose.md",
      mode: "comment",
      lines: [12, 18],
    });

    const packet = buildCompassPacket({
      sessionId: "sess-1",
      participantId: "ag-claude",
      reason: "comment",
      cursorBefore: null,
      events: [event],
    });
    const prompt = buildWakePrompt(packet);
    expect(prompt).toContain('"append_to"');
    expect(prompt).toContain('"mode": "comment"');
    expect(prompt).toContain('"lines"');
    expect(prompt).toContain("comment activity");
  });

  it("single-line anchor renders as @n-n", () => {
    const event = proseEvent("20260527T100100Z_us-a7f3.prose.md", "us-a7f3", {
      content: "this line",
      append_to: "20260527T095800Z_us-a7f3.prose.md",
      mode: "comment",
      lines: [5, 5],
    });

    const packet = buildCompassPacket({
      sessionId: "sess-1",
      participantId: "ag-claude",
      cursorBefore: null,
      events: [event],
    });
    expect(packet.events[0]!.summary).toBe(
      "comment on 20260527T095800Z_us-a7f3.prose.md @5-5: this line",
    );
    expect(packet.events[0]!.lines).toEqual([5, 5]);
  });

  it("comment with empty content drops the trailing colon", () => {
    const event = proseEvent("20260527T100100Z_us-a7f3.prose.md", "us-a7f3", {
      content: "",
      append_to: "20260527T095800Z_us-a7f3.prose.md",
      mode: "comment",
      lines: [1, 3],
    });

    const packet = buildCompassPacket({
      sessionId: "sess-1",
      participantId: "ag-claude",
      cursorBefore: null,
      events: [event],
    });
    expect(packet.events[0]!.summary).toBe(
      "comment on 20260527T095800Z_us-a7f3.prose.md @1-3",
    );
  });

  it("prose with append_to but no mode is treated as a content block, not a comment", () => {
    /* Renderer/store treat this as a 'content' role in the prose-roles
       table; the packet should reflect that — propagate `append_to`,
       leave `mode` undefined, and don't use the comment summary. */
    const event = proseEvent("20260527T100200Z_us-a7f3.prose.md", "us-a7f3", {
      content: "appended body",
      append_to: "20260527T095800Z_us-a7f3.prose.md",
    });

    const packet = buildCompassPacket({
      sessionId: "sess-1",
      participantId: "ag-claude",
      cursorBefore: null,
      events: [event],
    });
    expect(packet.events[0]!.append_to).toBe("20260527T095800Z_us-a7f3.prose.md");
    expect(packet.events[0]!.mode).toBeUndefined();
    expect(packet.events[0]!.summary).toBe("appended body");
  });

  it("malformed lines are dropped without poisoning the summary", () => {
    /* NaN, non-integer, reversed, and non-positive ranges must be
       rejected: better to omit `lines` than to render `@NaN-3` or
       serialize `[null, null]`. */
    const cases: Array<{ lines: unknown; expectedFragment: string }> = [
      { lines: [Number.NaN, 3], expectedFragment: "comment on parent" },
      { lines: [1, Number.POSITIVE_INFINITY], expectedFragment: "comment on parent" },
      { lines: [1.5, 3], expectedFragment: "comment on parent" },
      { lines: [5, 2], expectedFragment: "comment on parent" },
      { lines: [0, 0], expectedFragment: "comment on parent" },
      { lines: [-1, 3], expectedFragment: "comment on parent" },
      { lines: [1], expectedFragment: "comment on parent" },
      { lines: [1, 2, 3], expectedFragment: "comment on parent" },
    ];
    for (const { lines } of cases) {
      const event = proseEvent("20260527T100100Z_us-a7f3.prose.md", "us-a7f3", {
        content: "broken",
        append_to: "parent",
        mode: "comment",
        lines: lines as [number, number] | undefined,
      });
      const packet = buildCompassPacket({
        sessionId: "sess-1",
        participantId: "ag-claude",
        cursorBefore: null,
        events: [event],
      });
      expect(packet.events[0]!.lines).toBeUndefined();
      /* Summary should NOT contain @NaN/@-/@Infinity/etc. */
      expect(packet.events[0]!.summary).not.toMatch(/@(NaN|Infinity|-)/);
    }
  });

  it("payload: null on a prose event does not throw", () => {
    const event: AnyEventRecord = {
      filename: "20260527T100300Z_us-a7f3.prose.md",
      timestamp: "20260527T100300Z",
      participant_id: "us-a7f3",
      kind: "prose",
      payload: null as unknown as ProsePayload,
    };

    expect(() =>
      buildCompassPacket({
        sessionId: "sess-1",
        participantId: "ag-claude",
        cursorBefore: null,
        events: [event],
      }),
    ).not.toThrow();
  });

  it("comment with empty append_to is rejected (no comment summary, no propagation)", () => {
    const event = proseEvent("20260527T100100Z_us-a7f3.prose.md", "us-a7f3", {
      content: "bad",
      append_to: "",
      mode: "comment",
    });
    const packet = buildCompassPacket({
      sessionId: "sess-1",
      participantId: "ag-claude",
      cursorBefore: null,
      events: [event],
    });
    expect(packet.events[0]!.append_to).toBeUndefined();
    /* Falls back to the generic prose-content summary path. */
    expect(packet.events[0]!.summary).toBe("bad");
  });

  it("summary truncates at 240 chars with `...` for longer bodies", () => {
    const exact = "x".repeat(240);
    const oneOver = "x".repeat(241);
    const huge = "x".repeat(2000);

    const packetExact = buildCompassPacket({
      sessionId: "sess-1",
      participantId: "ag-claude",
      cursorBefore: null,
      events: [
        proseEvent("a.prose.md", "us-a7f3", { content: exact }),
      ],
    });
    expect(packetExact.events[0]!.summary.length).toBe(240);
    expect(packetExact.events[0]!.summary.endsWith("...")).toBe(false);

    const packetOver = buildCompassPacket({
      sessionId: "sess-1",
      participantId: "ag-claude",
      cursorBefore: null,
      events: [
        proseEvent("b.prose.md", "us-a7f3", { content: oneOver }),
      ],
    });
    expect(packetOver.events[0]!.summary.length).toBe(240);
    expect(packetOver.events[0]!.summary.endsWith("...")).toBe(true);

    const packetHuge = buildCompassPacket({
      sessionId: "sess-1",
      participantId: "ag-claude",
      cursorBefore: null,
      events: [
        proseEvent("c.prose.md", "us-a7f3", { content: huge }),
      ],
    });
    expect(packetHuge.events[0]!.summary.length).toBe(240);
    expect(packetHuge.events[0]!.summary.endsWith("...")).toBe(true);
  });
});
