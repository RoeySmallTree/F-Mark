import type { JSX } from "react";
import { Sessions } from "../panels/Sessions.js";
import { Search } from "../panels/Search.js";
import { Todos } from "../panels/Todos.js";
import { Comments } from "../panels/Comments.js";
import { Named } from "../panels/Named.js";
import { RightTodos } from "../panels/right/RightTodos.js";
import { RightComments } from "../panels/right/RightComments.js";
import { RightNamed } from "../panels/right/RightNamed.js";
import { RightAgents } from "../panels/right/RightAgents.js";
import { RightLog } from "../panels/right/RightLog.js";
import { RightFiles } from "../panels/right/RightFiles.js";
import { RightDiffTree } from "../panels/right/RightDiffTree.js";
import { RightTerminal } from "../panels/right/terminal/RightTerminal.js";
import { FileViewer } from "../panels/fileViewer/FileViewer.js";
import { useStore } from "../state/store.js";
import type { DockArea, DockPaneId } from "./dockLayout.js";
import { MessagesPane } from "./MessagesPane.js";

const NO_LOOSE_STRING_VALUES = {
  right: "right",
  left: "left",
} as const;

/* The file-viewer dock pane. When the viewer is popped out into the modal we
   show a placeholder here instead of a second live viewer, so only one heavy
   (Monaco/media) instance is ever mounted. */
function FileDisplayPane(): JSX.Element {
  const modalOpen = useStore((s) => s.fileViewerModalOpen);
  const setModalOpen = useStore((s) => s.setFileViewerModalOpen);
  if (!modalOpen) {
    return (
      <div className="file-display-pane">
        <FileViewer />
      </div>
    );
  }
  return (
    <div className="file-display-pane">
      <div className="fv-popped-out">
        <p>File viewer is in pop-out.</p>
        <button
          type="button"
          className="fv-popped-out-restore"
          onClick={() => setModalOpen(false)}
        >
          Bring it back
        </button>
      </div>
    </div>
  );
}

export function DockPaneContent({
  pane,
  area = NO_LOOSE_STRING_VALUES.right,
}: {
  pane: DockPaneId;
  area?: Exclude<DockArea, "toolbar">;
}): JSX.Element {
  switch (pane) {
    case "messages":
      return <MessagesPane />;
    case "sessions":
      return <Sessions />;
    case "search":
      return <Search />;
    case "todos":
      return area === NO_LOOSE_STRING_VALUES.left ? <Todos /> : <RightTodos />;
    case "comments":
      return area === NO_LOOSE_STRING_VALUES.left ? <Comments /> : <RightComments />;
    case "named":
      return area === NO_LOOSE_STRING_VALUES.left ? <Named /> : <RightNamed />;
    case "agents":
      return <RightAgents />;
    case "log":
      return <RightLog />;
    case "files":
      return <RightFiles />;
    case "diffTree":
      return <RightDiffTree />;
    case "terminal":
      return <RightTerminal />;
    case "filesDisplay":
      return <FileDisplayPane />;
  }
}
