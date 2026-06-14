import { describe, expect, test } from "vitest";
import { aggregate } from "../../src/state/aggregate.js";
import { makeChoices, makeHtml } from "../cards/_helpers.js";

describe("aggregate — visual-alternatives child html hiding", () => {
  test("html referenced by a choices option is hidden from feed slices but kept in events", () => {
    const htmlA = makeHtml("20260613T120000.001Z_ag-c92e.html", "ag-c92e", {
      id: "a",
    });
    const htmlB = makeHtml("20260613T120000.002Z_ag-c92e.html", "ag-c92e", {
      id: "b",
    });
    const choices = makeChoices(
      "20260613T120001Z_ag-c92e.choices.json",
      "ag-c92e",
      {
        id: "design",
        question: "Which?",
        options: [
          { id: "a", label: "A", html: htmlA.filename },
          { id: "b", label: "B", html: htmlB.filename },
        ],
        multi: false,
      },
    );
    const agg = aggregate([htmlA, htmlB, choices]);

    for (const slice of [agg.feed, agg.feedDocument, agg.feedConversation]) {
      expect(slice.some((e) => e.filename === htmlA.filename)).toBe(false);
      expect(slice.some((e) => e.filename === htmlB.filename)).toBe(false);
    }
    // The widget itself stays in the feed.
    expect(agg.feed.some((e) => e.filename === choices.filename)).toBe(true);
    // The child html events remain available for ChoicesCard / search / source.
    expect(agg.events.some((e) => e.filename === htmlA.filename)).toBe(true);
    expect(agg.events.some((e) => e.filename === htmlB.filename)).toBe(true);
  });

  test("a standalone html not referenced by any choices still renders in the feed", () => {
    const html = makeHtml("20260613T120000.001Z_ag-c92e.html", "ag-c92e", {
      id: "x",
    });
    const agg = aggregate([html]);
    expect(agg.feed.some((e) => e.filename === html.filename)).toBe(true);
  });

  test("child html of a SUPERSEDED alternatives widget stays hidden (not resurfaced)", () => {
    const htmlOld = makeHtml("20260613T120000.001Z_ag-c92e.html", "ag-c92e", {
      id: "old",
    });
    const htmlNew = makeHtml("20260613T120002.001Z_ag-c92e.html", "ag-c92e", {
      id: "new",
    });
    const v1 = makeChoices("20260613T120001Z_ag-c92e.choices.json", "ag-c92e", {
      id: "design",
      question: "Q1",
      options: [{ id: "a", label: "A", html: htmlOld.filename }],
      multi: false,
    });
    const v2 = makeChoices("20260613T120003Z_ag-c92e.choices.json", "ag-c92e", {
      id: "design",
      question: "Q2",
      options: [{ id: "a", label: "A2", html: htmlNew.filename }],
      multi: false,
      supersedes: v1.filename,
    });
    const agg = aggregate([htmlOld, htmlNew, v1, v2]);

    expect(agg.feed.some((e) => e.filename === v1.filename)).toBe(false); // superseded
    expect(agg.feed.some((e) => e.filename === v2.filename)).toBe(true);
    // htmlOld is referenced ONLY by the superseded v1 — it must not reappear.
    expect(agg.feed.some((e) => e.filename === htmlOld.filename)).toBe(false);
    expect(agg.feed.some((e) => e.filename === htmlNew.filename)).toBe(false);
  });
});
