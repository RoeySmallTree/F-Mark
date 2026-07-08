import type { ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { DiffModeToggle } from "../DiffModeToggle.js";
import { DiffStyleToggle } from "../DiffStyleToggle.js";
import { TabsRow } from "../TabsRow.js";
import {
  shouldShowDiffStyleToggle,
  shouldShowNoDiffChip,
  type FileViewerModel,
} from "./model.js";

export interface FileViewerChromeProps {
  model: FileViewerModel;
  leadingControls?: ReactNode;
  trailingControls?: ReactNode;
  canPopOut: boolean;
}

export function FileViewerChrome({
  model,
  leadingControls,
  trailingControls,
  canPopOut,
}: FileViewerChromeProps): JSX.Element {
  const { diffState, outcome, notGit, isTextKind, openModal } = model;

  return (
    <div className="fv-chrome">
      {leadingControls}
      <TabsRow />
      <div className="fv-chrome-spacer" />
      {trailingControls}
      <DiffModeToggle disabled={notGit} />
      {shouldShowNoDiffChip(diffState, outcome, notGit) ? (
        <span
          className="fv-diff-nochip"
          data-testid="fv-no-diff-chip"
          title="No changes for the selected diff mode — showing the file"
        >
          No diff
        </span>
      ) : null}
      {shouldShowDiffStyleToggle(
        diffState,
        outcome,
        notGit,
        isTextKind,
      ) ? (
        <DiffStyleToggle />
      ) : null}
      {canPopOut ? (
        <button
          type="button"
          className="fv-popout-btn"
          onClick={openModal}
          title="Pop out to full screen"
          aria-label="Pop out file viewer"
        >
          <Maximize2 size={13} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
