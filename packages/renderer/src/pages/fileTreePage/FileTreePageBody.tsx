import { FileViewer } from "../../panels/fileViewer/FileViewer.js";
import { RightComments } from "../../panels/right/RightComments.js";
import { RightFiles } from "../../panels/right/RightFiles.js";

export function FileTreePageBody(): JSX.Element {
  return (
    <div className="file-tree-page-body">
      <div className="file-tree-page-tree">
        <RightFiles />
      </div>
      <div className="file-tree-page-viewer">
        {/* Standalone has no modal pop-out surface; the viewer is always
            mounted here, so hide the pop-out button. */}
        <FileViewer canPopOut={false} />
      </div>
      {/* Existing file/line comment threads for this (path_id, sessionId).
          RightComments derives its scope from the seeded store state, so its
          post + wake already carry the file-tree scope. */}
      <div className="file-tree-page-comments">
        <RightComments />
      </div>
    </div>
  );
}
