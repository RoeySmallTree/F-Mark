import type { JSX } from "react";
import { LineCommentPopoverHeader } from "../../../../components/lineCommentPopover/LineCommentPopoverHeader.js";
import { lineLabel } from "./model.js";
import type { FileCommentDraftController, LineRange } from "./types.js";

interface FileCommentDraftHeaderProps {
  lines: LineRange;
  controller: FileCommentDraftController;
  onClose(): void;
}

export function FileCommentDraftHeader({
  lines,
  controller,
  onClose,
}: FileCommentDraftHeaderProps): JSX.Element {
  return (
    <LineCommentPopoverHeader
      currentWho={controller.currentWho}
      lineLabel={lineLabel(lines)}
      onClose={onClose}
    />
  );
}
