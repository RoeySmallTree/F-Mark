import dagre from "dagre";
import type { FlowNode, FlowEdge } from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  lr: "LR",
} as const;

const NODE_W = 160;
const NODE_H = 56;

export function layoutFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
): FlowNode[] {
  const allPositioned = nodes.every((n) => n.position !== undefined);
  if (allPositioned) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: NO_LOOSE_STRING_VALUES.lr, nodesep: 40, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  return nodes.map((n) => {
    const { x, y } = g.node(n.id);
    // dagre returns the CENTER; React Flow wants the top-left corner.
    return { ...n, position: { x: x - NODE_W / 2, y: y - NODE_H / 2 } };
  });
}
