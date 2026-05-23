import { afterEach, describe, expect, test } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { AnyEventRecord } from "@f-mark/shared";
import { ProseInlineBlock } from "../../src/cards/ProseInlineBlock.js";
import { PARTICIPANTS, makeProse } from "./_helpers.js";

describe("ProseInlineBlock registry dispatcher", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders real markdown for a prose block (no longer a stub)", () => {
    /* Phase 7 replaced the prose stub with the real markdown renderer.
       A prose block now shows its actual content via fm-prose, with an
       optional sub-section header above when `name` is set. */
    const ev = makeProse(
      "20260522T120000Z_ag-c92e.prose.md",
      "ag-c92e",
      { content: "**hello** body", append_to: "anchor.md" },
    );
    const { container } = render(
      <ProseInlineBlock
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        mode="rendered"
      />,
    );
    expect(container.querySelector(".prose-inline-prose")).not.toBeNull();
    expect(container.querySelector(".fm-prose")).not.toBeNull();
    expect(container.textContent).toContain("hello");
    // Phase 7's prose block is NOT a stub anymore.
    expect(container.querySelector(".prose-embed-stub")).toBeNull();
  });

  test("named prose block renders its name as an h3 sub-section header", () => {
    const ev = makeProse(
      "20260522T120050Z_ag-c92e.prose.md",
      "ag-c92e",
      {
        name: "Data flow",
        content: "Body content.",
        append_to: "anchor.md",
      },
    );
    const { container } = render(
      <ProseInlineBlock
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        mode="rendered"
      />,
    );
    const h3 = container.querySelector(".prose-block-name");
    expect(h3).not.toBeNull();
    expect(h3?.tagName).toBe("H3");
    expect(h3?.textContent).toBe("Data flow");
  });

  test("registered non-prose kinds render their real embedded card (not stubs)", () => {
    /* Phases 9+10 replaced the remaining stubs with the real cards.
       Each kind renders its corresponding card class — no `.prose-embed-stub`. */
    const cases: { kind: AnyEventRecord["kind"]; cardClass: string; payload: object }[] = [
      {
        kind: "html",
        cardClass: ".embed-card-embedded",
        payload: { id: "h1", title: "demo", append_to: "anchor.md" },
      },
      {
        kind: "choices",
        cardClass: ".choices-card-embedded",
        payload: {
          id: "c1",
          question: "Pick?",
          multi: false,
          options: [{ id: "a", label: "A" }],
          append_to: "anchor.md",
        },
      },
      {
        kind: "todo",
        cardClass: ".todo-card",
        payload: {
          id: "t1",
          title: "do",
          status: "open",
          append_to: "anchor.md",
        },
      },
      {
        kind: "file",
        cardClass: ".file-card",
        payload: {
          id: "f1",
          path: "note.txt",
          mime_type: "text/plain",
          append_to: "anchor.md",
        },
      },
      {
        kind: "tool-use",
        cardClass: ".tool-use-card",
        payload: {
          tool_name: "Bash",
          tool_use_id: "tu1",
          input: {},
          success: true,
          append_to: "anchor.md",
        },
      },
    ];
    for (const { kind, cardClass, payload } of cases) {
      const ev: AnyEventRecord = {
        filename: `20260522T120100Z_ag-c92e.${kind}.json`,
        timestamp: "20260522T120100Z",
        participant_id: "ag-c92e",
        kind,
        payload: payload as never,
      };
      const { container } = render(
        <ProseInlineBlock
          event={ev}
          participants={PARTICIPANTS}
          comments={[]}
          mode="rendered"
        />,
      );
      expect(container.querySelector(cardClass), `${kind} card`).not.toBeNull();
      expect(
        container.querySelector(".prose-embed-stub"),
        `${kind} not a stub`,
      ).toBeNull();
      cleanup();
    }
  });

  test("flow block renders real embedded FlowCard (no longer a stub)", () => {
    /* Phase 8 replaced the flow stub with FlowCard variant="embedded".
       The embedded variant drops the .flow-head chrome but keeps the
       canvas and (optional) title. */
    const ev: AnyEventRecord = {
      filename: "20260522T120150Z_ag-c92e.flow.json",
      timestamp: "20260522T120150Z",
      participant_id: "ag-c92e",
      kind: "flow",
      payload: {
        id: "fl_t",
        title: "Pipeline",
        nodes: [{ id: "n1", label: "A", position: { x: 0, y: 0 } }],
        edges: [],
        append_to: "anchor.md",
      },
    };
    const { container } = render(
      <ProseInlineBlock
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        mode="rendered"
      />,
    );
    expect(container.querySelector(".flow-card-embedded")).not.toBeNull();
    expect(container.querySelector(".flow-head")).toBeNull();
    expect(container.querySelector(".prose-embed-stub")).toBeNull();
    expect(container.textContent).toContain("Pipeline");
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
