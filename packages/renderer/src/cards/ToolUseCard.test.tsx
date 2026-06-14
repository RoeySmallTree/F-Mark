import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { ToolUseCard } from "./ToolUseCard";
import type { ToolUseEventRecord } from "@f-mark/shared";
import { useStore } from "../state/store";

function cssRule(selector: string): string {
  const css =
    readFileSync(resolve(process.cwd(), "src/cards/cards.css"), "utf8") +
    "\n" +
    readFileSync(resolve(process.cwd(), "src/agent-components.css"), "utf8");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, `Missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

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
  beforeEach(() => {
    useStore.setState({
      activePath: "/workspace/F-Mark",
      currentSessionId: "session-1",
      openFile: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Bash tools with command name plus muted remainder", () => {
    render(<ToolUseCard event={makeEvent()} />);
    expect(screen.getByText("Bash", { selector: ".tool-type" })).toBeInTheDocument();
    expect(screen.getByText("ls", { selector: ".tool-summary-primary" })).toBeInTheDocument();
    expect(screen.getByText("-la", { selector: ".tool-summary-muted" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Command" })).not.toBeInTheDocument();
  });

  it("keeps long Bash summaries constrained with muted overflow text", () => {
    render(
      <ToolUseCard
        event={makeEvent({
          input: {
            command:
              'find /home/roey/workspace/ides/t3code/apps/web/src/components/chat -type f -name "*.tsx" -o -name "*.ts" | head -40',
          },
        })}
      />,
    );

    expect(screen.getByText("find", { selector: ".tool-summary-primary" })).toBeInTheDocument();
    expect(
      screen.getByText(/\/home\/roey\/workspace\/ides\/t3code/, {
        selector: ".tool-summary-muted",
      }),
    ).toBeInTheDocument();

    const summaryRule = cssRule(".tool-summary");
    expect(summaryRule).toContain("flex: 0 1 auto;");
    expect(summaryRule).toContain("max-width: min(68ch, 100%);");
    const mutedRule = cssRule(".tool-summary-muted");
    expect(mutedRule).toContain("color: var(--ink-4);");
    expect(mutedRule).toContain("text-overflow: ellipsis;");
    const statusRule = cssRule(".tool-head > .spin, .tool-head > .ok-dot, .tool-head > .err-dot");
    expect(statusRule).toContain("margin-left: auto;");
  });

  it("expands input + result on click", () => {
    render(<ToolUseCard event={makeEvent({ result: { stdout: "total 0\n" } })} />);
    fireEvent.click(screen.getByRole("button", { name: /toggle tool details/i }));
    const commandSection = screen.getByRole("heading", { name: "Command" }).closest("section");
    const stdoutSection = screen.getByRole("heading", { name: "stdout" }).closest("section");
    expect(commandSection).not.toBeNull();
    expect(stdoutSection).not.toBeNull();
    expect(within(commandSection as HTMLElement).getByText("ls -la")).toBeInTheDocument();
    expect(within(stdoutSection as HTMLElement).getByText(/total 0/)).toBeInTheDocument();
  });

  it("shows an error state when success=false", () => {
    render(<ToolUseCard event={makeEvent({ success: false, result: "permission denied" })} />);
    const toggle = screen.getByRole("button", { name: /toggle tool details/i });
    expect(toggle.querySelector(".err-dot")).not.toBeNull();
  });

  it("renders duration when present", () => {
    render(<ToolUseCard event={makeEvent({ duration_ms: 1234 })} />);
    expect(screen.getByText(/1\.2\s*s|1234\s*ms/)).toBeInTheDocument();
  });

  it("shows a waiting state when result is undefined (turn ended mid-tool)", () => {
    render(<ToolUseCard event={makeEvent({ result: undefined })} />);
    expect(screen.getByText(/waiting for result/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "stdout" })).not.toBeInTheDocument();
  });

  it("renders Read tools with a pressable file card and excerpt", () => {
    const openFile = vi.fn();
    useStore.setState({ openFile });
    render(
      <ToolUseCard
        event={makeEvent({
          tool_name: "Read",
          input: { file_path: "src/App.tsx", limit: 2, offset: 10 },
          result: { content: "export function App() {\n  return null;\n}" },
        })}
      />,
    );
    expect(screen.getByText("Read", { selector: ".tool-type" })).toBeInTheDocument();
    expect(screen.getByText("App.tsx", { selector: ".tool-summary-primary" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /toggle tool details/i }));
    const fileButton = screen.getByRole("button", { name: /App\.tsx/i });
    expect(fileButton).toBeInTheDocument();
    const excerptSection = screen.getByRole("heading", { name: "Excerpt" }).closest("section");
    expect(excerptSection).not.toBeNull();
    expect(within(excerptSection as HTMLElement).getByText(/export function App/)).toBeInTheDocument();
    fireEvent.click(fileButton);
    expect(openFile).toHaveBeenCalledWith("/workspace/F-Mark/src/App.tsx");
  });

  it("renders Edit tools as a diff instead of primary JSON", () => {
    render(
      <ToolUseCard
        event={makeEvent({
          tool_name: "Edit",
          input: {
            file_path: "/workspace/F-Mark/src/App.tsx",
            old_string: "className=\"old\"",
            new_string: "className=\"new\"",
            replace_all: false,
          },
          result: { success: true, originalFile: "large file body should stay in raw details" },
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /toggle tool details/i }));
    const diffSection = screen.getByRole("heading", { name: "Diff" }).closest("section");
    expect(diffSection).not.toBeNull();
    expect(within(diffSection as HTMLElement).getByText("className=\"old\"")).toBeInTheDocument();
    expect(within(diffSection as HTMLElement).getByText("className=\"new\"")).toBeInTheDocument();
    expect(screen.getByText("Raw details")).toBeInTheDocument();
  });

  it("toggles Edit diffs between inline and side-by-side with synced panes", () => {
    render(
      <ToolUseCard
        event={makeEvent({
          tool_name: "Edit",
          input: {
            file_path: "/workspace/F-Mark/src/App.tsx",
            old_string: "const value = oldValue;\nreturn value;",
            new_string: "const value = newValue;\nreturn value;",
          },
          result: { success: true },
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /toggle tool details/i }));

    const diffSection = screen.getByRole("heading", { name: "Diff" }).closest("section");
    expect(diffSection).not.toBeNull();
    const section = diffSection as HTMLElement;
    expect(within(section).getByTestId("tool-diff-inline")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Inline" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(within(section).getByRole("button", { name: "Side by side" }));

    expect(within(section).queryByTestId("tool-diff-inline")).not.toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Side by side" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const beforePane = within(section).getByTestId("tool-diff-before-pane");
    const afterPane = within(section).getByTestId("tool-diff-after-pane");
    expect(within(beforePane).getByText("const value = oldValue;")).toBeInTheDocument();
    expect(within(afterPane).getByText("const value = newValue;")).toBeInTheDocument();

    beforePane.scrollTop = 42;
    beforePane.scrollLeft = 7;
    fireEvent.scroll(beforePane);
    expect(afterPane.scrollTop).toBe(42);
    expect(afterPane.scrollLeft).toBe(7);

    afterPane.scrollTop = 84;
    afterPane.scrollLeft = 3;
    fireEvent.scroll(afterPane);
    expect(beforePane.scrollTop).toBe(84);
    expect(beforePane.scrollLeft).toBe(3);
  });

  it("keeps F-Mark tool discovery compact instead of a JSON wall", () => {
    render(
      <ToolUseCard
        event={makeEvent({
          tool_name: "ToolSearch",
          input: { query: "select:mcp__fmark__fmark_post_choices", max_results: 3 },
          result: { matches: [{ name: "mcp__fmark__fmark_post_choices" }] },
        })}
      />,
    );
    expect(screen.getByText("F-Mark tool selection")).toBeInTheDocument();
    expect(document.querySelector(".tool-call.internal")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "input" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "result" })).not.toBeInTheDocument();
    expect(screen.getByText("Raw details").closest("details")).not.toHaveAttribute("open");
  });

  it("routes internal tool raw details through theme-tokenized card colors", () => {
    render(
      <ToolUseCard
        event={makeEvent({
          tool_name: "ToolSearch",
          input: { query: "select:mcp__fmark__fmark_post_choices", max_results: 3 },
          result: { matches: [{ name: "mcp__fmark__fmark_post_choices" }] },
        })}
      />,
    );

    const details = screen.getByText("Raw details").closest("details");
    expect(details).not.toBeNull();
    expect(details).toHaveClass("tool-raw-details");
    const rawPre = within(details as HTMLElement).getByText(/select:mcp__fmark__/);
    expect(rawPre.tagName).toBe("PRE");

    const rawRule = cssRule(".tool-raw-details pre");
    expect(rawRule).toContain("background: var(--tool-card-pre-bg, var(--panel));");
    expect(rawRule).toContain("color: var(--tool-card-pre-fg, var(--ink-2));");
    expect(rawRule).toContain("border: 1px solid var(--line-3);");
  });

  it("dims compact internal tool cards and reddens failed ones", () => {
    const internalRule = cssRule(".tool-call.internal");
    expect(internalRule).toContain("opacity:");

    const errorRule = cssRule(".tool-call.error");
    expect(errorRule).toContain("var(--rose)");
    expect(errorRule).not.toContain("var(--agent)");
  });
});
