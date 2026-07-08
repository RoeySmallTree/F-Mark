import { type JSX } from "react";
import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { FlowEdge as FlowEdgeData, FlowEdgeStyle } from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  dashed: "dashed",
  dotted: "dotted",
  flowing: "flowing",
  default: "default",
  solid: "solid",
  flowEdge: "flow-edge",
} as const;

type FlowEdgeType = Edge<{ data: FlowEdgeData }>;

function dashFor(style: FlowEdgeStyle | undefined): string | undefined {
  if (style === NO_LOOSE_STRING_VALUES.dashed) return "8 4";
  if (style === NO_LOOSE_STRING_VALUES.dotted) return "2 4";
  if (style === NO_LOOSE_STRING_VALUES.flowing) return "6 4";
  return undefined;
}

export function FlowEdge(props: EdgeProps<FlowEdgeType>): JSX.Element {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    id,
  } = props;
  const e = data?.data;
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const type = e?.type ?? NO_LOOSE_STRING_VALUES.default;
  const style = e?.style ?? NO_LOOSE_STRING_VALUES.solid;
  const dash = dashFor(style);
  const className = [
    NO_LOOSE_STRING_VALUES.flowEdge,
    `flow-edge-${type}`,
    style === NO_LOOSE_STRING_VALUES.flowing ? NO_LOOSE_STRING_VALUES.flowing : "",
  ]
    .filter(Boolean)
    .join(" ");
  const edgeStyle =
    dash !== undefined ? { strokeDasharray: dash } : undefined;

  return (
    <BaseEdge id={id} path={path} className={className} style={edgeStyle} />
  );
}
