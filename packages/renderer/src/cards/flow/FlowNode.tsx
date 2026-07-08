import { type JSX, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNode as FlowNodeData } from "@f-mark/shared";
import { assemblePopoverSrcdoc } from "./popover.js";

const NO_LOOSE_STRING_VALUES = {
  default: "default",
  flowNode: "flow-node",
  focused: "focused",
  allowScripts: "allow-scripts",
} as const;

type FlowNodeType = Node<{ data: FlowNodeData }>;

export function FlowNode({ data }: NodeProps<FlowNodeType>): JSX.Element {
  const [open, setOpen] = useState(false);
  const n = data.data;
  const type = n.itemType ?? NO_LOOSE_STRING_VALUES.default;
  const classes = [
    NO_LOOSE_STRING_VALUES.flowNode,
    `flow-node-${type}`,
    n.focused === true ? NO_LOOSE_STRING_VALUES.focused : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      onClick={() => {
        if (n.popover !== undefined) setOpen((v) => !v);
      }}
      data-clickable={n.popover !== undefined ? "true" : "false"}
    >
      <Handle type="target" position={Position.Left} className="flow-handle" />
      <div className="flow-node-label">{n.label}</div>
      {n.title !== undefined && n.title.length > 0 && (
        <div className="flow-node-title">{n.title}</div>
      )}
      {n.content !== undefined && n.content.length > 0 && (
        <div className="flow-node-content">{n.content}</div>
      )}
      <Handle type="source" position={Position.Right} className="flow-handle" />
      {n.popover !== undefined && open && (
        <div className="flow-popover" onClick={(e) => e.stopPropagation()}>
          <iframe
            title={`${n.label} popover`}
            srcDoc={assemblePopoverSrcdoc(n.popover)}
            sandbox={NO_LOOSE_STRING_VALUES.allowScripts}
          />
        </div>
      )}
    </div>
  );
}
