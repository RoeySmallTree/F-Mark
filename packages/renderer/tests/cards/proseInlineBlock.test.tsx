import { afterEach, describe, expect, test } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { AnyEventRecord } from "@f-mark/shared";
import { ProseInlineBlock } from "../../src/cards/ProseInlineBlock.js";
import { PARTICIPANTS, makeProse } from "./_helpers.js";

describe("ProseInlineBlock registry dispatcher", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders a stub for a known kind (prose)", () => {
    const ev = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      { content: "body", append_to: "anchor.md" },
    );
    const { container } = render(
      <ProseInlineBlock
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        mode="rendered"
      />,
    );
    const stub = container.querySelector(".prose-embed-stub");
    expect(stub).not.toBeNull();
    expect(stub?.textContent).toContain("prose block");
    expect(stub?.textContent).toContain("TODO");
  });

  test("renders a stub for each registered non-prose kind", () => {
    /* Walks the registry surface area: one event per supported kind, all
       composing under the same anchor. */
    const kinds = [
      "flow",
      "file",
      "html",
      "choices",
      "todo",
      "tool-use",
    ] as const;
    for (const kind of kinds) {
      const ev: AnyEventRecord = {
        filename: `20260522T120100Z_ag-c92e.${kind}.json`,
        timestamp: "20260522T120100Z",
        participant_id: "ag-c92e",
        kind,
        payload: { append_to: "anchor.md" },
      };
      const { container } = render(
        <ProseInlineBlock
          event={ev}
          participants={PARTICIPANTS}
          comments={[]}
          mode="rendered"
        />,
      );
      const stub = container.querySelector(".prose-embed-stub");
      expect(stub, `stub for ${kind}`).not.toBeNull();
      expect(stub?.textContent, `stub label for ${kind}`).toContain(
        `${kind} block`,
      );
      cleanup();
    }
  });

  test("unknown kind falls back to UnsupportedBlock", () => {
    /* `turn-end` isn't in the inline registry — its top-level dispatch
       renders a divider, but as an embedded block it falls through to
       the quiet unsupported stub. */
    const ev: AnyEventRecord = {
      filename: "20260522T120200Z_ag-c92e.turn-end.json",
      timestamp: "20260522T120200Z",
      participant_id: "ag-c92e",
      kind: "turn-end",
      payload: { participant_id: "ag-c92e" },
    };
    const { container } = render(
      <ProseInlineBlock
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        mode="rendered"
      />,
    );
    const stub = container.querySelector(".prose-embed-stub");
    expect(stub).not.toBeNull();
    expect(stub?.getAttribute("data-unsupported")).not.toBeNull();
    expect(stub?.textContent).toContain("unsupported");
  });

  test("wrapper carries data-event-filename + data-block-kind", () => {
    /* These two attributes keep right-panel comment focus (scrolls to
       `[data-event-filename]`) working for embedded blocks, and let
       theme + per-kind styling key off the wrapper. */
    const ev = makeProse(
      "20260522T120300Z_ag-c92e.prose.md",
      "ag-c92e",
      { content: "body", append_to: "anchor.md" },
    );
    const { container } = render(
      <ProseInlineBlock
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        mode="rendered"
      />,
    );
    const frame = container.querySelector(".prose-embed-frame");
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute("data-event-filename")).toBe(ev.filename);
    expect(frame?.getAttribute("data-block-kind")).toBe("prose");
  });
});
