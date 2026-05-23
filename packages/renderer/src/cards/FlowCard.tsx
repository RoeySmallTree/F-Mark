import { useMemo, type JSX } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  type Node as RfNode,
  type Edge as RfEdge,
} from "@xyflow/react";
import { Workflow, MoreHorizontal } from "lucide-react";
import type {
  AnyEventRecord,
  FlowPayload,
  Participant,
} from "@f-mark/shared";
import { copyToClipboard } from "../render/copy.js";
import { formatWhen, whoOf } from "./format.js";
import { FlowNode } from "./flow/FlowNode.js";
import { FlowEdge } from "./flow/FlowEdge.js";
import { layoutFlow } from "./flow/layoutFlow.js";
import "@xyflow/react/dist/style.css";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
}

const NODE_TYPES = { flow: FlowNode };
const EDGE_TYPES = { flow: FlowEdge };

function FlowInner({ payload }: { payload: FlowPayload }): JSX.Element {
  const positioned = useMemo(
    () => layoutFlow(payload.nodes, payload.edges),
    [payload],
  );
  const rfNodes = useMemo<RfNode[]>(
    () =>
      positioned.map((n) => ({
        id: n.id,
        position: n.position!,
        data: { data: n },
        type: "flow",
      })),
    [positioned],
  );
  const rfEdges = useMemo<RfEdge[]>(
    () =>
      payload.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "flow",
        data: { data: e },
        label: e.label,
      })),
    [payload],
  );
  const rf = useReactFlow();
  const focusedId = useMemo(
    () => payload.nodes.find((n) => n.focused === true)?.id,
    [payload],
  );

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      fitView
      onInit={() => {
        if (focusedId !== undefined) {
          const node = rf.getNode(focusedId);
          if (node !== undefined) {
            rf.fitView({ nodes: [node], padding: 0.3 });
          }
        }
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={16} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function FlowCard({ event, participants }: Props): JSX.Element {
  const payload = event.payload as FlowPayload;
  const who = whoOf(event.participant_id, participants);
  const title =
    typeof payload.title === "string" && payload.title.length > 0
      ? payload.title
      : payload.id;

  return (
    <div className="flow-card" data-event-kind="flow">
      <div className="flow-head">
        <span
          className={["avatar", who.isUser ? "user" : "agent", "sm"].join(" ")}
          aria-hidden
        >
          {who.initial}
        </span>
        <span className="who">{who.name}</span>
        <span className="when">{formatWhen(event.timestamp)}</span>
        <span className="badge">
          <Workflow size={10} aria-hidden /> FLOW
        </span>
        <button
          type="button"
          className="menu"
          aria-label="Copy flow id"
          title="Copy flow id"
          onClick={() => void copyToClipboard(payload.id)}
        >
          <MoreHorizontal size={14} aria-hidden />
        </button>
      </div>
      <div className="flow-title">{title}</div>
      <div className="flow-canvas">
        <ReactFlowProvider>
          <FlowInner payload={payload} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
