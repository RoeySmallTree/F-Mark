import { afterEach, describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ToolUseCard } from "./ToolUseCard";
import type { ToolUseEventRecord } from "@f-mark/shared";

function makeEvent(over: Partial<ToolUseEventRecord["payload"]> = {}): ToolUseEventRecord {
  return {
    filename: "20260523T100000Z_ag-claude.tool-use.json",
    timestamp: "20260523T100000Z",
    participant_id: "ag-claude",
    kind: "tool-use",
    payload: {
      tool_name: "Bash",
      tool_use_id: "tu_1",
      input: { command: "ls -la" },
      result: "total 0\n",
      success: true,
      duration_ms: 14,
      ...over,
    },
  };
}

describe("<ToolUseCard>", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the tool name and starts collapsed", () => {
    render(<ToolUseCard event={makeEvent()} />);
    expect(screen.getByText("Bash")).toBeInTheDocument();
    expect(screen.queryByText("ls -la")).not.toBeInTheDocument();
  });

  it("expands input + result on click", () => {
    render(<ToolUseCard event={makeEvent()} />);
    fireEvent.click(screen.getByRole("button", { name: /toggle tool details/i }));
    expect(screen.getByText(/ls -la/)).toBeInTheDocument();
    expect(screen.getByText(/total 0/)).toBeInTheDocument();
  });

  it("shows an error state when success=false", () => {
    render(<ToolUseCard event={makeEvent({ success: false, result: "permission denied" })} />);
    expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
  });

  it("renders duration when present", () => {
    render(<ToolUseCard event={makeEvent({ duration_ms: 1234 })} />);
    expect(screen.getByText(/1\.2\s*s|1234\s*ms/)).toBeInTheDocument();
  });

  it("omits result section when result is undefined (turn ended mid-tool)", () => {
    render(<ToolUseCard event={makeEvent({ result: undefined })} />);
    fireEvent.click(screen.getByRole("button", { name: /toggle tool details/i }));
    expect(screen.queryByText(/result/i)).not.toBeInTheDocument();
  });
});
