import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MarkdownRenderer } from "../../src/panels/fileViewer/renderers/MarkdownRenderer.js";
import { jsonResponse, resetStore } from "../cards/_helpers.js";

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
          },
          {
            KeyMod: { CtrlCmd: 2048 },
            KeyCode: { KeyS: 49 },
          },
        );
      }, [props]);
      return (
        <textarea
          aria-label="mock markdown editor"
          data-read-only={props.options.readOnly === true ? "true" : "false"}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
      );
    },
  };
});

describe("MarkdownRenderer editing", () => {
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
              content: "# Before\n\nplain text\n",
              truncated: false,
              size: 21,
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

  test("defaults to preview-only markdown view", async () => {
    render(<MarkdownRenderer path="/project/docs/readme.md" />);

    expect(await screen.findByRole("heading", { name: "Before" })).toBeInTheDocument();
    expect(screen.queryByLabelText("mock markdown editor")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("switches between preview, interactive, source, and side-by-side modes", async () => {
    const user = userEvent.setup();
    render(<MarkdownRenderer path="/project/docs/readme.md" />);

    await screen.findByRole("heading", { name: "Before" });

    await user.click(screen.getByRole("button", { name: "Interactive outline" }));
    expect(screen.queryByLabelText("mock markdown editor")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Before" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Before/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Source" }));
    expect(screen.getByLabelText("mock markdown editor")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Before" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Side by side" }));
    expect(screen.getByLabelText("mock markdown editor")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Before" })).toBeInTheDocument();
  });

  test("edits markdown in source mode, updates the preview, and autosaves", async () => {
    const user = userEvent.setup();
    render(<MarkdownRenderer path="/project/docs/readme.md" />);

    await screen.findByRole("heading", { name: "Before" });
    await user.click(screen.getByRole("button", { name: "Source" }));

    const editor = await screen.findByLabelText("mock markdown editor");
    fireEvent.change(editor, {
      target: { value: "# After\n\nupdated **markdown**\n" },
    });
    expect(screen.getByText("Saving soon…")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("heading", { name: "After" })).toBeInTheDocument();
    expect(screen.getByText("markdown", { selector: "strong" })).toBeInTheDocument();

    await waitFor(
      () => {
        const fetchMock = vi.mocked(fetch);
        const saveCall = fetchMock.mock.calls.find(
          ([url, init]) => String(url) === "/files/text" && init?.method === "PUT",
        );
        expect(saveCall).toBeTruthy();
        expect(JSON.parse(String((saveCall![1] as RequestInit).body))).toEqual({
          path_id: "project-id",
          rel_path: "docs/readme.md",
          content: "# After\n\nupdated **markdown**\n",
        });
      },
      { timeout: 1500 },
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  test("persists markdown view mode in localStorage", async () => {
    const user = userEvent.setup();
    render(<MarkdownRenderer path="/project/docs/readme.md" />);

    await screen.findByRole("heading", { name: "Before" });
    await user.click(screen.getByRole("button", { name: "Side by side" }));

    expect(globalThis.localStorage?.getItem("fmark:settings:markdown-view-mode")).toBe(
      "side-by-side",
    );
  });
});
