import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolFileReference } from "../../src/cards/ToolPresentationParts.js";
import { useScopedFile } from "../../src/panels/fileViewer/fileScope.js";
import { FileRow } from "../../src/panels/right/files/FileRow.js";
import type { VisibleRow } from "../../src/panels/right/files/buildTreeView.js";
import { useStore } from "../../src/state/store.js";
import {
  applyDockLayout,
  getCurrentDockLayout,
  moveDockPane,
  resetDockLayout,
  setDockActive,
  surfaceFileDisplayInDock,
} from "../../src/shell/dockLayout.js";
import { FileDisplaySurfaceProvider } from "../../src/shell/fileDisplaySurface.js";

const SID = "session-1";
const ABS_PATH = "/workspace/project/src/file.ts";
const ACTIVE_ROOT = "/workspace/active";
const SELECTED_ROOT = "/workspace/selected";

function row(): VisibleRow {
  return {
    entry: {
      index: 0,
      parent: null,
      name: "file.ts",
      relPath: "src/file.ts",
      absPath: ABS_PATH,
      isDir: false,
      isSymlink: false,
      ext: "ts",
      size: 12,
      mtimeMs: 1,
      ignored: false,
      depth: 0,
    },
    isOpen: false,
    hasChildren: false,
    fav: null,
    children: [],
  };
}

afterEach(() => {
  cleanup();
  resetDockLayout();
  useStore.setState({
    activePath: null,
    activePathId: null,
    currentSessionId: null,
    fileViewerTabsBySession: {},
    fileViewerActiveBySession: {},
    rightTab: "log",
    rightTabBySession: {},
    selectedPath: null,
    selectedPathId: null,
  });
});

describe("FileRow dock activation", () => {
  it("activates the docked file-display pane when a tree file is opened", async () => {
    let layout = moveDockPane(getCurrentDockLayout(), "filesDisplay", "center");
    layout = setDockActive(layout, "center", "messages");
    applyDockLayout(layout);
    useStore.setState({ currentSessionId: SID, rightTab: "log" });

    render(
      <FileDisplaySurfaceProvider value={surfaceFileDisplayInDock}>
        <FileRow row={row()} onCycleFav={() => undefined} />
      </FileDisplaySurfaceProvider>,
    );
    await userEvent.click(screen.getByText("file.ts"));

    expect(useStore.getState().fileViewerActiveBySession[SID]).toBe(ABS_PATH);
    expect(useStore.getState().rightTab).toBe("files");
    expect(getCurrentDockLayout().active.center).toBe("filesDisplay");
  });

  it("opens chat file references under the selected root and presents the file tab", async () => {
    let layout = moveDockPane(getCurrentDockLayout(), "filesDisplay", "center");
    layout = setDockActive(layout, "center", "messages");
    applyDockLayout(layout);
    useStore.setState({
      activePath: ACTIVE_ROOT,
      activePathId: "active-id",
      currentSessionId: SID,
      rightTab: "log",
      selectedPath: SELECTED_ROOT,
      selectedPathId: "selected-id",
    });

    render(
      <FileDisplaySurfaceProvider value={surfaceFileDisplayInDock}>
        <ToolFileReference file={{ path: "src/from-chat.ts" }} />
      </FileDisplaySurfaceProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /from-chat/i }));

    expect(useStore.getState().fileViewerActiveBySession[SID]).toBe(
      `${SELECTED_ROOT}/src/from-chat.ts`,
    );
    expect(useStore.getState().rightTab).toBe("files");
    expect(getCurrentDockLayout().active.center).toBe("filesDisplay");
  });
});

function ScopedFileProbe({ path }: { path: string }): JSX.Element {
  const scoped = useScopedFile(path);
  return (
    <output
      aria-label="scoped-file"
      data-rel={scoped?.relPath ?? "null"}
      data-scope={
        scoped === null
          ? "null"
          : "pathId" in scoped.scope
            ? scoped.scope.pathId
            : scoped.scope.root
      }
    />
  );
}

describe("File viewer root scope", () => {
  it("uses the selected root before the kernel active root", () => {
    useStore.setState({
      activePath: ACTIVE_ROOT,
      activePathId: "active-id",
      selectedPath: SELECTED_ROOT,
      selectedPathId: "selected-id",
    });

    render(<ScopedFileProbe path={`${SELECTED_ROOT}/src/from-chat.ts`} />);

    const probe = screen.getByLabelText("scoped-file");
    expect(probe).toHaveAttribute("data-rel", "src/from-chat.ts");
    expect(probe).toHaveAttribute("data-scope", "selected-id");
  });
});
