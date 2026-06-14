import { useStore } from "../../../state/store.js";
import { Compose } from "../../../compose/Compose.js";
import { Feed } from "../../../shell/Feed.js";
import { FileViewer } from "../FileViewer.js";
import { CenterSwitcher } from "../CenterSwitcher.js";
import { ComposeReveal } from "../ComposeReveal.js";

/* The replace-chat shell occupies the feed-col. Mode toggles between
   the standard chat view (Feed + Compose) and the file viewer. When
   viewing files, Compose can be toggled visible at the bottom for quick
   message-sending without leaving the file. */
export function ReplaceChatShell(): JSX.Element {
  const mode = useStore((s) => s.fileViewerReplaceCenter);
  const composeOpen = useStore((s) => s.fileViewerComposeOpenInFiles);

  if (mode === "chat") {
    return (
      <>
        <Feed />
        <div className="compose">
          <Compose />
        </div>
      </>
    );
  }

  return (
    <div className="fv-replace-chat">
      <FileViewer leadingControls={<CenterSwitcher />} />
      <ComposeReveal />
      {composeOpen ? (
        <div className="compose">
          <Compose />
        </div>
      ) : null}
    </div>
  );
}
