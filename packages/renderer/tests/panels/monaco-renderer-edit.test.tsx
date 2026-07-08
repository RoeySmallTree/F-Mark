import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MonacoRenderer } from "../../src/panels/fileViewer/renderers/MonacoRenderer.js";
import { useStore } from "../../src/state/store.js";
import { resetStore, jsonResponse, makeProse } from "../cards/_helpers.js";

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
        const disposable = { dispose: vi.fn() };
        const lineHeight = 18;
        props.onMount(
          {
            addCommand: vi.fn(),
            createDecorationsCollection: () => ({
              set: vi.fn(),
              clear: vi.fn(),
            }),
            onMouseMove: () => disposable,
            onMouseLeave: () => disposable,
            onMouseDown: () => disposable,
            onDidChangeCursorSelection: () => disposable,
            onDidScrollChange: () => disposable,
            onDidLayoutChange: () => disposable,
            onDidChangeModelContent: () => disposable,
            getSelection: () => null,
            getScrollTop: () => 0,
            getTopForLineNumber: (line: number) => (line - 1) * lineHeight,
            getOption: () => lineHeight,
            getDomNode: () => document.createElement("div"),
          },
          {
            KeyMod: { CtrlCmd: 2048 },
            KeyCode: { KeyS: 49 },
            Range: class Range {
              constructor(
                readonly startLineNumber: number,
                readonly startColumn: number,
                readonly endLineNumber: number,
                readonly endColumn: number,
              ) {}
            },
            editor: {
              MouseTargetType: {
                GUTTER_GLYPH_MARGIN: 1,
                GUTTER_LINE_NUMBERS: 2,
                CONTENT_TEXT: 3,
              },
              EditorOption: { lineHeight: 52 },
            },
          },
        );
      }, [props]);
      return (
        <textarea
          aria-label="mock monaco editor"
          data-read-only={props.options.readOnly === true ? "true" : "false"}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
      );
    },
  };
});

describe("MonacoRenderer editing", () => {
  beforeEach(() => {
    resetStore();
    globalThis.localStorage?.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/files/text") && (init?.method ?? "GET") === "GET") {
          return Promise.resolve(
            jsonResponse({
              content: "before\n",
              truncated: false,
              size: 7,
              mtimeMs: 1,
            }),
          );
        }
        if (url === "/files/text" && init?.method === "PUT") {
          const body = JSON.parse(String(init.body)) as { content: string };
          return Promise.resolve(
            jsonResponse({
              content: body.content,
              truncated: false,
              size: body.content.length,
              mtimeMs: 2,
            }),
          );
        }
        return Promise.resolve(jsonResponse({}));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("autosaves scoped edits by default and hides the manual save button", async () => {
    render(<MonacoRenderer path="/project/src/a.ts" />);

    const editor = await screen.findByLabelText("mock monaco editor");
    expect(editor).toHaveValue("before\n");
    expect(editor).toHaveAttribute("data-read-only", "false");
    expect(screen.getByText("/project/src/a.ts")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save file/i })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /autosave/i })).toBeChecked();

    fireEvent.change(editor, { target: { value: "after\n" } });
    expect(screen.getByText("Saving soon…")).toBeInTheDocument();

    await waitFor(
      () => {
        const fetchMock = vi.mocked(fetch);
        const saveCall = fetchMock.mock.calls.find(
          ([url, init]) => String(url) === "/files/text" && init?.method === "PUT",
        );
        expect(saveCall).toBeTruthy();
        expect(JSON.parse(String((saveCall![1] as RequestInit).body))).toEqual({
          path_id: "project-id",
          rel_path: "src/a.ts",
          content: "after\n",
        });
      },
      { timeout: 1500 },
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  test("shows the save button when autosave is off", async () => {
    const user = userEvent.setup();
    render(<MonacoRenderer path="/project/src/a.ts" />);

    const editor = await screen.findByLabelText("mock monaco editor");
    await user.click(screen.getByRole("checkbox", { name: /autosave/i }));

    fireEvent.change(editor, { target: { value: "after\n" } });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save file/i }));

    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      const saveCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === "/files/text" && init?.method === "PUT",
      );
      expect(saveCall).toBeTruthy();
      expect(JSON.parse(String((saveCall![1] as RequestInit).body))).toEqual({
        path_id: "project-id",
        rel_path: "src/a.ts",
        content: "after\n",
      });
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  test("copies the file path from the edit bar", async () => {
    const user = userEvent.setup();
    render(<MonacoRenderer path="/project/src/a.ts" />);

    await screen.findByLabelText("mock monaco editor");
    await user.click(screen.getByRole("button", { name: /copy file path/i }));

    expect(
      screen.getByRole("button", { name: /copied file path/i }),
    ).toBeInTheDocument();
  });

  test("renders existing file-comment markers in the monaco overlay rail", async () => {
    const comment = makeProse(
      "20260613T120000Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "look here", file_path: "src/a.ts", lines: [1, 1] },
    );
    useStore.setState({
      events: [comment],
      activePath: "/project",
      activePathId: "project-id",
    });

    render(<MonacoRenderer path="/project/src/a.ts" />);

    const marker = await screen.findByLabelText(/Open comment on line 1/i);
    expect(marker).toBeInTheDocument();
    expect(marker.closest(".line-comment-marker.existing")).not.toBeNull();
  });
});
