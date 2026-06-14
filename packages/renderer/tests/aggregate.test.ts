import { describe, it, expect } from "vitest";
import { aggregate } from "../src/state/aggregate.js";
import type { AnyEventRecord } from "@f-mark/shared";

function prose(
  filename: string,
  payload: Record<string, unknown>,
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "us-x",
    kind: "prose",
    payload: { content: "", ...payload },
  };
}

function turnEnd(filename: string, participantId = "us-x"): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: participantId,
    kind: "turn-end",
    payload: { participant_id: participantId },
  };
}

function choices(filename: string, id = "q1"): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "us-x",
    kind: "choices",
    payload: {
      id,
      question: "Pick?",
      options: [{ id: "a", label: "A" }],
      multi: false,
    },
  };
}

function choice(
  filename: string,
  choicesId: string,
  selected: string[],
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "us-x",
    kind: "choice",
    payload: { choices_id: choicesId, selected },
  };
}

describe("aggregate", () => {
  it("groups visible feed (excludes superseded but keeps comment activity)", () => {
    const a = prose("20260522T000001Z_us-x.prose.md", { content: "hi" });
    const b = prose("20260522T000002Z_us-x.prose.md", {
      content: "comment",
      append_to: a.filename, mode: "comment",
    });
    const c = prose("20260522T000003Z_us-x.prose.md", {
      content: "v2",
      supersedes: a.filename,
    });
    const agg = aggregate([a, b, c]);
    expect(agg.feed.map((e) => e.filename)).toEqual([
      b.filename,
      c.filename,
    ]);
  });

  it("derives named list", () => {
    const a = prose("20260522T000001Z_us-x.prose.md", {
      content: "x",
      name: "Plan",
    });
    const b = prose("20260522T000002Z_us-x.prose.md", { content: "y" });
    expect(aggregate([a, b]).named.map((e) => e.filename)).toEqual([a.filename]);
  });

  it("groups comments by target filename", () => {
    const a = prose("20260522T000001Z_us-x.prose.md", { content: "anchor" });
    const c1 = prose("20260522T000002Z_us-x.prose.md", {
      content: "first",
      append_to: a.filename, mode: "comment",
    });
    const c2 = prose("20260522T000003Z_us-x.prose.md", {
      content: "second",
      append_to: a.filename, mode: "comment",
    });
    const agg = aggregate([a, c1, c2]);
    expect(agg.commentsByTarget.get(a.filename)?.map((c) => c.filename)).toEqual([
      c1.filename,
      c2.filename,
    ]);
  });

  it("derives current turn from latest turn-end", () => {
    const tend: AnyEventRecord = {
      filename: "20260522T000004Z_ag-c.turn-end.json",
      timestamp: "20260522T000004Z",
      participant_id: "ag-c",
      kind: "turn-end",
      payload: { participant_id: "ag-c" },
    };
    const agg = aggregate([tend]);
    expect(agg.currentTurnParticipantPrefix).toBe("us");
  });

  it("defaults turn to user if no turn-end", () => {
    expect(aggregate([]).currentTurnParticipantPrefix).toBe("us");
  });

  describe("feedDocument", () => {
    it("includes named prose only; excludes unnamed prose, comments, choices, turn-ends", () => {
      const named = prose("20260522T000001Z_us-x.prose.md", {
        content: "plan body",
        name: "Plan",
      });
      const unnamed = prose("20260522T000002Z_us-x.prose.md", {
        content: "quick reply",
      });
      const comment = prose("20260522T000003Z_us-x.prose.md", {
        content: "feedback",
        append_to: named.filename, mode: "comment",
      });
      const namedWithTarget = prose("20260522T000004Z_us-x.prose.md", {
        content: "comment with both",
        name: "Note",
        append_to: named.filename, mode: "comment",
      });
      const tend = turnEnd("20260522T000005Z_us-x.turn-end.json");
      const ch = choices("20260522T000006Z_us-x.choices.json");
      const chSel = choice("20260522T000007Z_us-x.choice.json", "q1", ["a"]);

      const agg = aggregate([
        named,
        unnamed,
        comment,
        namedWithTarget,
        tend,
        ch,
        chSel,
      ]);
      expect(agg.feedDocument.map((e) => e.filename)).toEqual([
        named.filename,
      ]);
    });

    it("inherits supersession (superseded named prose drops out)", () => {
      const v1 = prose("20260522T000001Z_us-x.prose.md", {
        content: "v1",
        name: "Plan",
      });
      const v2 = prose("20260522T000002Z_us-x.prose.md", {
        content: "v2",
        name: "Plan",
        supersedes: v1.filename,
      });
      const agg = aggregate([v1, v2]);
      expect(agg.feedDocument.map((e) => e.filename)).toEqual([v2.filename]);
    });

    it("returns [] when no named prose exists (turn-ends alone are not enough)", () => {
      const unnamed = prose("20260522T000001Z_us-x.prose.md", { content: "hi" });
      const tend = turnEnd("20260522T000002Z_us-x.turn-end.json");
      expect(aggregate([unnamed, tend]).feedDocument).toEqual([]);
    });
  });

  describe("feedConversation", () => {
    it("includes unnamed prose, comment activity, choices, choice, and turn-end; excludes named prose", () => {
      const unnamed = prose("20260522T000001Z_us-x.prose.md", { content: "hi" });
      const named = prose("20260522T000002Z_us-x.prose.md", {
        content: "doc body",
        name: "Plan",
      });
      const comment = prose("20260522T000003Z_us-x.prose.md", {
        content: "note",
        append_to: named.filename, mode: "comment",
      });
      const ch = choices("20260522T000004Z_us-x.choices.json");
      const chSel = choice("20260522T000005Z_us-x.choice.json", "q1", ["a"]);
      const tend = turnEnd("20260522T000006Z_us-x.turn-end.json");

      const agg = aggregate([unnamed, named, comment, ch, chSel, tend]);
      expect(agg.feedConversation.map((e) => e.filename)).toEqual([
        unnamed.filename,
        comment.filename,
        ch.filename,
        chSel.filename,
        tend.filename,
      ]);
    });

    it("inherits supersession (superseded unnamed prose drops out)", () => {
      const v1 = prose("20260522T000001Z_us-x.prose.md", { content: "v1" });
      const v2 = prose("20260522T000002Z_us-x.prose.md", {
        content: "v2",
        supersedes: v1.filename,
      });
      const agg = aggregate([v1, v2]);
      expect(agg.feedConversation.map((e) => e.filename)).toEqual([v2.filename]);
    });

    it("returns [] when no qualifying events exist", () => {
      const named = prose("20260522T000001Z_us-x.prose.md", {
        content: "x",
        name: "Plan",
      });
      expect(aggregate([named]).feedConversation).toEqual([]);
    });
  });

  describe("flow events", () => {
    function flow(filename: string): AnyEventRecord {
      return {
        filename,
        timestamp: filename.split("_")[0]!,
        participant_id: "ag-claude",
        kind: "flow",
        payload: { id: "fl1", nodes: [], edges: [] },
      };
    }

    it("includes flow events in feedDocument", () => {
      const agg = aggregate([flow("20260523T100000Z_ag-claude.flow.json")]);
      expect(agg.feedDocument).toHaveLength(1);
      expect(agg.feedDocument[0]!.kind).toBe("flow");
    });

    it("does NOT include flow events in feedConversation", () => {
      const agg = aggregate([flow("20260523T100000Z_ag-claude.flow.json")]);
      expect(agg.feedConversation).toHaveLength(0);
    });
  });

  describe("consumed-block feed filtering (Phase 6)", () => {
    function flow(filename: string, payload: Record<string, unknown> = {}): AnyEventRecord {
      return {
        filename,
        timestamp: filename.split("_")[0]!,
        participant_id: "ag-claude",
        kind: "flow",
        payload: { id: "fl1", nodes: [], edges: [], ...payload },
      };
    }

    it("excludes consumed blocks (flow appended to anchor) from feed and feedDocument", () => {
      const anchor = prose("20260523T100001Z_us-x.prose.md", {
        name: "Doc",
      });
      const block = flow("20260523T100002Z_ag-claude.flow.json", {
        append_to: anchor.filename,
      });
      const agg = aggregate([anchor, block]);
      /* Consumed: anchor stays top-level, flow is rendered inside it. */
      expect(agg.feed.map((e) => e.filename)).toEqual([anchor.filename]);
      expect(agg.feedDocument.map((e) => e.filename)).toEqual([anchor.filename]);
      expect(
        agg.consumedBlocksByAnchor.get(anchor.filename)?.map((e) => e.filename),
      ).toEqual([block.filename]);
    });

    it("excludes consumed prose blocks from feedConversation", () => {
      const anchor = prose("20260523T100010Z_us-x.prose.md", {
        name: "Doc",
      });
      const block = prose("20260523T100011Z_us-x.prose.md", {
        content: "section body",
        append_to: anchor.filename,
      });
      const message = prose("20260523T100012Z_us-x.prose.md", {
        content: "stand-alone msg",
      });
      const agg = aggregate([anchor, block, message]);
      /* Anchor and message are unnamed/named per role; block is consumed
         and must not appear in any feed slice. */
      expect(agg.feed.map((e) => e.filename)).toEqual([
        anchor.filename,
        message.filename,
      ]);
      expect(agg.feedConversation.map((e) => e.filename)).toEqual([
        message.filename,
      ]);
    });

    it("keeps orphan blocks (append_to points at missing parent) visible at top level", () => {
      /* Block references a parent that doesn't exist in the visible set
         — must stay in `feed` so the user/agent can see it. */
      const orphan = flow("20260523T100020Z_ag-claude.flow.json", {
        append_to: "nonexistent.prose.md",
      });
      const agg = aggregate([orphan]);
      expect(agg.orphanBlocks.has(orphan.filename)).toBe(true);
      expect(agg.feed.map((e) => e.filename)).toEqual([orphan.filename]);
    });

    it("excludes consumed blocks whose anchor was superseded (re-binds to live anchor)", () => {
      const v1 = prose("20260523T100030Z_us-x.prose.md", { name: "Doc" });
      const v2 = prose("20260523T100031Z_us-x.prose.md", {
        name: "Doc",
        supersedes: v1.filename,
      });
      const block = flow("20260523T100032Z_ag-claude.flow.json", {
        append_to: v1.filename,
      });
      const agg = aggregate([v1, v2, block]);
      /* v1 is superseded → not visible; block re-binds to v2 (live).
         block is consumed, so it must not show top-level. */
      expect(agg.feed.map((e) => e.filename)).toEqual([v2.filename]);
      expect(agg.consumedBlocksByAnchor.get(v2.filename)?.map((e) => e.filename)).toEqual(
        [block.filename],
      );
    });
  });
});
