import type { JSX } from "react";
import { LineCommentPopoverView } from "./lineCommentPopover/LineCommentPopoverView.js";
import type { LineCommentPopoverProps } from "./lineCommentPopover/types.js";

export function LineCommentPopover(
  props: LineCommentPopoverProps,
): JSX.Element {
  return <LineCommentPopoverView props={props} />;
}
