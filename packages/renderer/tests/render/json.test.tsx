import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { JsonRenderer } from "../../src/render/JsonRenderer.js";

afterEach(() => cleanup());

describe("JsonRenderer", () => {
  it("'tree' mode opens root and keeps deeper nodes collapsed", () => {
    const { container } = render(
      <JsonRenderer value={{ a: { b: 1 }, c: [2, 3] }} />,
    );
    const detailsAll = container.querySelectorAll("details.fm-json-details");
    // Root + 2 children (object `a`, array `c`) = 3 collection nodes total.
    expect(detailsAll.length).toBe(3);
    // Root should be open by default.
    const root = detailsAll[0]!;
    expect(root.hasAttribute("open")).toBe(true);
    // Child object/array nodes should not be open by default.
    const childDetails = root.querySelectorAll("details.fm-json-details");
    expect(childDetails.length).toBe(2);
    for (const c of Array.from(childDetails)) {
      expect(c.hasAttribute("open")).toBe(false);
    }
  });

  it("'tree' mode reveals nested content when child summary is clicked", () => {
    const { container } = render(
      <JsonRenderer value={{ a: { b: 1 } }} />,
    );
    const detailsAll = container.querySelectorAll("details.fm-json-details");
    expect(detailsAll.length).toBe(2);
    const aNode = detailsAll[1]!;
    expect(aNode.hasAttribute("open")).toBe(false);
    fireEvent.click(aNode.querySelector("summary")!);
    expect(aNode.hasAttribute("open")).toBe(true);
    // Inside the now-open node, the leaf `b: 1` is visible.
    const numbers = aNode.querySelectorAll(".fm-json-number");
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers[0]!.textContent).toBe("1");
  });

  it("'source' mode renders JSON.stringify(value, null, 2) verbatim", () => {
    const value = { a: 1, b: [true, null, "x"] };
    const { container } = render(
      <JsonRenderer value={value} mode="source" />,
    );
    const pre = container.querySelector("pre.fm-source");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toBe(JSON.stringify(value, null, 2));
  });

  it("'table' mode renders a table with union-of-keys columns and one row per item", () => {
    const data = [
      { name: "a", n: 1 },
      { name: "b", n: 2 },
    ];
    const { container } = render(
      <JsonRenderer value={data} mode="table" />,
    );
    const table = container.querySelector("table.fm-json-table");
    expect(table).not.toBeNull();
    const headers = Array.from(table!.querySelectorAll("thead th")).map(
      (th) => th.textContent,
    );
    expect(new Set(headers)).toEqual(new Set(["name", "n"]));
    const rows = table!.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);
  });

  it("'table' mode falls back to tree when the value is not an array of objects", () => {
    const { container } = render(
      <JsonRenderer value={{ not: "an array" }} mode="table" />,
    );
    expect(container.querySelector("table.fm-json-table")).toBeNull();
    // Should fall through to tree mode.
    expect(container.querySelector(".fm-json-tree")).not.toBeNull();
  });

  it("'expand all' button opens every nested details node", () => {
    const { container } = render(
      <JsonRenderer value={{ a: { b: { c: 1 } } }} />,
    );
    const expandBtn = Array.from(
      container.querySelectorAll("button.fm-json-toolbar-btn"),
    ).find((b) => b.textContent === "expand all");
    expect(expandBtn).toBeDefined();
    fireEvent.click(expandBtn!);
    const all = container.querySelectorAll("details.fm-json-details");
    expect(all.length).toBeGreaterThan(1);
    for (const d of Array.from(all)) {
      expect(d.hasAttribute("open")).toBe(true);
    }
  });
});
