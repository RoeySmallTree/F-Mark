import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { JsonRenderer } from "../../src/panels/fileViewer/renderers/JsonRenderer.js";
import { jsonResponse, resetStore } from "../cards/_helpers.js";

const JSON_TEXT = JSON.stringify(
  {
    name: "fixture",
    nested: { count: 2 },
    items: [1, 2],
  },
  null,
  2,
);

const disposable = { dispose: vi.fn() };

function makeDecorationsCollection() {
  return {
    set: vi.fn(),
    clear: vi.fn(),
  };
}

vi.mock("@monaco-editor/react", async () => {
  const React = await import("react");
  return {
    default: function MockEditor(props: {
      value: string;
      onChange(value: string | undefined): void;
      onMount(editor: unknown, monaco: unknown): void;
      options: { readOnly?: boolean };
    }) {
      React.useEffect(() => {
        props.onMount(
          {
            addCommand: vi.fn(),
            createDecorationsCollection: vi.fn(makeDecorationsCollection),
            onMouseMove: vi.fn(() => disposable),
            onMouseLeave: vi.fn(() => disposable),
            onMouseDown: vi.fn(() => disposable),
            onDidChangeCursorSelection: vi.fn(() => disposable),
            onDidScrollChange: vi.fn(() => disposable),
            onDidLayoutChange: vi.fn(() => disposable),
            onDidChangeModelContent: vi.fn(() => disposable),
            getSelection: vi.fn(() => null),
            getModel: vi.fn(() => ({
              getValue: () => props.value,
              getLineCount: () => props.value.split(/\r?\n/).length,
            })),
            getOption: vi.fn(() => 18),
            getScrollTop: vi.fn(() => 0),
            getTopForLineNumber: vi.fn((line: number) => (line - 1) * 18),
            revealLineInCenter: vi.fn(),
          },
          {
            KeyMod: { CtrlCmd: 2048 },
            KeyCode: { KeyS: 49 },
            Range: class MockRange {
              constructor(
                public startLineNumber: number,
                public startColumn: number,
                public endLineNumber: number,
                public endColumn: number,
              ) {}
            },
            editor: {
              EditorOption: {
                lineHeight: 67,
              },
              MouseTargetType: {
                GUTTER_GLYPH_MARGIN: 1,
                GUTTER_LINE_NUMBERS: 2,
                CONTENT_TEXT: 3,
              },
            },
          },
        );
      }, [props]);
      return (
        <textarea
          aria-label="mock json editor"
          data-read-only={props.options.readOnly === true ? "true" : "false"}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
      );
    },
  };
});

function mockTextFetch(content: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/files/text") && (init?.method ?? "GET") === "GET") {
        return Promise.resolve(
          jsonResponse({
            content,
            truncated: false,
            size: content.length,
            mtimeMs: 1,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    }),
  );
}

describe("JsonRenderer", () => {
  beforeEach(() => {
    resetStore();
    globalThis.localStorage?.clear();
    mockTextFetch(JSON_TEXT);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("defaults to editable source mode", async () => {
    const { container } = render(<JsonRenderer path="/project/data/config.json" />);

    expect(await screen.findByLabelText("mock json editor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Source" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(container.querySelector(".fm-json-tree")).toBeNull();
  });

  test("switches to the interactive JSON tree and persists the choice", async () => {
    const user = userEvent.setup();
    const { container } = render(<JsonRenderer path="/project/data/config.json" />);

    await screen.findByLabelText("mock json editor");
    await user.click(screen.getByRole("button", { name: "Interactive JSON" }));

    expect(screen.queryByLabelText("mock json editor")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Interactive JSON preview")).toBeInTheDocument();
    expect(container.querySelector(".fm-json-tree")).not.toBeNull();
    expect(screen.getByText("{ 3 keys }")).toBeInTheDocument();
    expect(globalThis.localStorage?.getItem("fmark:settings:json-view-mode")).toBe(
      "tree",
    );
  });

  test("shows an inline parse error for malformed JSON in tree mode", async () => {
    mockTextFetch("{ nope");
    const user = userEvent.setup();
    render(<JsonRenderer path="/project/data/broken.json" />);

    await screen.findByLabelText("mock json editor");
    await user.click(screen.getByRole("button", { name: "Interactive JSON" }));

    expect(screen.getByText("Invalid JSON")).toBeInTheDocument();
    expect(screen.getByText("{ nope")).toBeInTheDocument();
  });
});
