import { afterEach, describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FlowCard } from "../../src/cards/FlowCard";
import type { FlowEventRecord, Participant } from "@f-mark/shared";

const participants: Record<string, Participant> = {
  "ag-claude": {
    id: "ag-claude",
    kind: "agent",
    name: "Claude",
    color: "#b86a1f",
  },
};

function makeEvent(
  over: Partial<FlowEventRecord["payload"]> = {},
): FlowEventRecord {
  return {
    filename: "20260523T100000Z_ag-claude.flow.json",
    timestamp: "20260523T100000Z",
    participant_id: "ag-claude",
    kind: "flow",
    payload: {
      id: "fl_demo",
      title: "Demo",
      nodes: [
        {
          id: "a",
          label: "Alpha",
          itemType: "info",
          position: { x: 0, y: 0 },
        },
        {
          id: "b",
          label: "Beta",
          itemType: "success",
          position: { x: 200, y: 0 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          target: "b",
          style: "solid",
          type: "default",
        },
      ],
      ...over,
    },
  };
}

describe("<FlowCard>", () => {
  afterEach(() => cleanup());

  it("renders the node labels", () => {
    render(<FlowCard event={makeEvent()} participants={participants} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("renders the flow title in the card head", () => {
    render(<FlowCard event={makeEvent()} participants={participants} />);
    expect(screen.getByText("Demo")).toBeInTheDocument();
  });

  it("applies the itemType class to nodes", () => {
    const { container } = render(
      <FlowCard event={makeEvent()} participants={participants} />,
    );
    expect(container.querySelector(".flow-node-info")).not.toBeNull();
    expect(container.querySelector(".flow-node-success")).not.toBeNull();
  });

  it("marks a focused node with the focused class", () => {
    const { container } = render(
      <FlowCard
        event={makeEvent({
          nodes: [
            {
              id: "a",
              label: "Alpha",
              focused: true,
              position: { x: 0, y: 0 },
            },
            { id: "b", label: "Beta", position: { x: 200, y: 0 } },
          ],
        })}
        participants={participants}
      />,
    );
    const focused = container.querySelector(".flow-node.focused");
    expect(focused).not.toBeNull();
    expect(focused?.textContent).toContain("Alpha");
  });

  it("opens a sandboxed iframe popover when a popover-bearing node is clicked", () => {
    const { container } = render(
      <FlowCard
        event={makeEvent({
          nodes: [
            {
              id: "a",
              label: "Alpha",
              position: { x: 0, y: 0 },
              popover: { html: "<p>inside popover</p>" },
            },
          ],
          edges: [],
        })}
        participants={participants}
      />,
    );
    expect(container.querySelector(".flow-popover")).toBeNull();
    fireEvent.click(screen.getByText("Alpha"));
    const iframe = container.querySelector(".flow-popover iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe?.getAttribute("srcdoc")).toContain("inside popover");
  });
});
