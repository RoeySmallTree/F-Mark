import { useMemo } from "react";
import { useStore, type OpenFileTab } from "../../state/store.js";
import { LayoutToggle } from "./LayoutToggle.js";
import { TabsRow } from "./TabsRow.js";
import { extOf, pickRenderer } from "./renderers/pickRenderer.js";
import { FileViewerErrorBoundary } from "./FileViewerErrorBoundary.js";

/* Module-scope stable empty array. Returning a fresh `[]` from a
   useStore selector triggers an infinite render loop because zustand
   compares references — every call returns a new array, so the
   subscription thinks the value changed and schedules another render,
   which calls the selector again, and so on. */
const EMPTY_TABS: OpenFileTab[] = [];
import { ImageRenderer } from "./renderers/ImageRenderer.js";
import { VideoRenderer } from "./renderers/VideoRenderer.js";
import { AudioRenderer } from "./renderers/AudioRenderer.js";
import { MarkdownRenderer } from "./renderers/MarkdownRenderer.js";
import { CsvRenderer } from "./renderers/CsvRenderer.js";
import { OfficeRenderer } from "./renderers/OfficeRenderer.js";
import { MonacoRenderer } from "./renderers/MonacoRenderer.js";
import { BinaryFallbackRenderer } from "./renderers/BinaryFallbackRenderer.js";

export interface FileViewerProps {
  /* Slot for chrome controls a specific shell wants to inject — close
     button (modal), collapse (extra), center-switcher (replace-chat), etc.
     Rendered to the left of the LayoutToggle. */
  leadingControls?: React.ReactNode;
  trailingControls?: React.ReactNode;
}

export function FileViewer({
  leadingControls,
  trailingControls,
}: FileViewerProps): JSX.Element {
  const sid = useStore((s) => s.currentSessionId);
  const tabs = useStore((s) =>
    sid !== null
      ? (s.fileViewerTabsBySession[sid] ?? EMPTY_TABS)
      : EMPTY_TABS,
  );
  const active = useStore((s) =>
    sid !== null ? (s.fileViewerActiveBySession[sid] ?? null) : null,
  );

  /* The viewer key is the active path — switching files unmounts the
     previous renderer so heavy editors (Monaco, Cherry) reset cleanly
     rather than swapping their content via props. */
  const body = useMemo(() => {
    if (active === null) {
      return (
        <div className="fv-empty">
          <p>No file open.</p>
          <p className="fv-empty-hint">
            Click a file in the tree to open it.
          </p>
        </div>
      );
    }
    const kind = pickRenderer(extOf(active));
    switch (kind) {
      case "image":
        return <ImageRenderer key={active} path={active} />;
      case "video":
        return <VideoRenderer key={active} path={active} />;
      case "audio":
        return <AudioRenderer key={active} path={active} />;
      case "markdown":
        return <MarkdownRenderer key={active} path={active} />;
      case "csv":
        return <CsvRenderer key={active} path={active} />;
      case "office-xlsx":
        return <OfficeRenderer key={active} path={active} kind="xlsx" />;
      case "office-docx":
        return <OfficeRenderer key={active} path={active} kind="docx" />;
      case "office-pptx":
        return <OfficeRenderer key={active} path={active} kind="pptx" />;
      case "monaco":
        return <MonacoRenderer key={active} path={active} />;
      case "binary":
        return <BinaryFallbackRenderer key={active} path={active} />;
    }
  }, [active]);

  return (
    <div className="fv-root">
      <div className="fv-chrome">
        {leadingControls}
        <TabsRow />
        <div className="fv-chrome-spacer" />
        {trailingControls}
        <LayoutToggle />
      </div>
      <div className="fv-body" key={active ?? "empty"}>
        <FileViewerErrorBoundary resetKey={active ?? "empty"}>
          {body}
        </FileViewerErrorBoundary>
      </div>
      {tabs.length === 0 && active === null ? null : null}
    </div>
  );
}
