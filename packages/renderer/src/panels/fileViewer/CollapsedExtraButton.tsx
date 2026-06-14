import { PanelRightOpen } from "lucide-react";
import { useStore } from "../../state/store.js";

/* Floating chevron rendered when the extra pane is collapsed. Clicking
   it expands the pane back. Positioned just inside the right edge of
   the right panel — see fileViewer.css `.fv-floating-btn.is-extra`. */
export function CollapsedExtraButton(): JSX.Element {
  const setCollapsed = useStore((s) => s.setFileViewerExtraCollapsed);
  return (
    <button
      type="button"
      className="fv-floating-btn is-extra"
      onClick={() => setCollapsed(false)}
      title="Open file viewer"
      aria-label="Open file viewer"
    >
      <PanelRightOpen size={14} aria-hidden />
      <span>Files</span>
    </button>
  );
}
