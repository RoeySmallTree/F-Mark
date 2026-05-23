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
  it("groups visible feed (excludes superseded + comments)", () => {
    const a = prose("20260522T000001Z_us-x.prose.md", { content: "hi" });
    const b = prose("20260522T000002Z_us-x.prose.md", {
      content: "comment",
      target: { file: a.filename },
    });
    const c = prose("20260522T000003Z_us-x.prose.md", {
      content: "v2",
      supersedes: a.filename,
    });
    const agg = aggregate([a, b, c]);
    expect(agg.feed.map((e) => e.filename)).toEqual([c.filename]);
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
      target: { file: a.filename },
    });
    const c2 = prose("20260522T000003Z_us-x.prose.md", {
      content: "second",
      target: { file: a.filename },
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
        target: { file: named.filename },
      });
      const namedWithTarget = prose("20260522T000004Z_us-x.prose.md", {
        content: "comment with both",
        name: "Note",
        target: { file: named.filename },
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
    it("includes unnamed prose + choices + choice + turn-end; excludes named prose and comments", () => {
      const unnamed = prose("20260522T000001Z_us-x.prose.md", { content: "hi" });
      const named = prose("20260522T000002Z_us-x.prose.md", {
        content: "doc body",
        name: "Plan",
      });
      const comment = prose("20260522T000003Z_us-x.prose.md", {
        content: "note",
        target: { file: named.filename },
      });
      const ch = choices("20260522T000004Z_us-x.choices.json");
      const chSel = choice("20260522T000005Z_us-x.choice.json", "q1", ["a"]);
      const tend = turnEnd("20260522T000006Z_us-x.turn-end.json");

      const agg = aggregate([unnamed, named, comment, ch, chSel, tend]);
      expect(agg.feedConversation.map((e) => e.filename)).toEqual([
        unnamed.filename,
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
});
