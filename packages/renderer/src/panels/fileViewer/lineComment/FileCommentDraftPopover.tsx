import type { JSX } from "react";
import { FileCommentDraftPopoverView } from "./fileCommentDraftPopover/FileCommentDraftPopoverView.js";
import { useFileCommentDraftController } from "./fileCommentDraftPopover/useFileCommentDraftController.js";
import type { FileCommentDraftPopoverProps } from "./fileCommentDraftPopover/types.js";

export type { FileCommentDraftPopoverProps } from "./fileCommentDraftPopover/types.js";
export {
  lineLabel as fileCommentLineLabel,
  useDefaultFileCommentMentions,
} from "./fileCommentDraftPopover/model.js";

/* Draft popover for composing a file/line comment from the file viewer.
   Kept position-agnostic so Monaco, rendered files, and diff hunks can share
   the same public entry point. */
export function FileCommentDraftPopover(
  props: FileCommentDraftPopoverProps,
): JSX.Element {
  const controller = useFileCommentDraftController(props);
  return <FileCommentDraftPopoverView {...props} controller={controller} />;
}
