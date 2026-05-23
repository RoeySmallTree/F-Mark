import { describe, it, expect } from "vitest";
import type { FlowNode, FlowEdge } from "@f-mark/shared";
import { layoutFlow } from "./layoutFlow";

describe("layoutFlow", () => {
  it("assigns positions to nodes that lack one", () => {
    const nodes: FlowNode[] = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ];
    const edges: FlowEdge[] = [{ id: "e1", source: "a", target: "b" }];
    const out = layoutFlow(nodes, edges);
    expect(out[0]!.position).toBeDefined();
    expect(out[1]!.position).toBeDefined();
    // LR dagre layout places b to the right of a.
    expect(out[1]!.position!.x).toBeGreaterThan(out[0]!.position!.x);
  });

  it("preserves explicit positions when ALL nodes have one", () => {
    const nodes: FlowNode[] = [
      { id: "a", label: "A", position: { x: 10, y: 20 } },
      { id: "b", label: "B", position: { x: 100, y: 200 } },
    ];
    const out = layoutFlow(nodes, []);
    expect(out[0]!.position).toEqual({ x: 10, y: 20 });
    expect(out[1]!.position).toEqual({ x: 100, y: 200 });
  });

  it("runs layout when ANY node lacks a position (mixed-mode means dagre wins)", () => {
    const nodes: FlowNode[] = [
      { id: "a", label: "A", position: { x: 999, y: 999 } },
      { id: "b", label: "B" }, // missing
    ];
    const out = layoutFlow(nodes, []);
    expect(out[0]!.position).toBeDefined();
    expect(out[1]!.position).toBeDefined();
    // Explicit pos was NOT preserved in mixed-mode.
    expect(out[0]!.position).not.toEqual({ x: 999, y: 999 });
  });
});
