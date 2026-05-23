import { type JSX } from "react";
import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { FlowEdge as FlowEdgeData, FlowEdgeStyle } from "@f-mark/shared";

type FlowEdgeType = Edge<{ data: FlowEdgeData }>;

function dashFor(style: FlowEdgeStyle | undefined): string | undefined {
  if (style === "dashed") return "8 4";
  if (style === "dotted") return "2 4";
  if (style === "flowing") return "6 4";
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
  const type = e?.type ?? "default";
  const style = e?.style ?? "solid";
  const dash = dashFor(style);
  const className = [
    "flow-edge",
    `flow-edge-${type}`,
    style === "flowing" ? "flowing" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const edgeStyle =
    dash !== undefined ? { strokeDasharray: dash } : undefined;

  return (
    <BaseEdge id={id} path={path} className={className} style={edgeStyle} />
  );
}
