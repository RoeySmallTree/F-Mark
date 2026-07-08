import type { JSX } from "react";
import { CommentThreadOverlayView } from "./CommentThreadOverlayView.js";
import type { CommentThreadOverlayProps } from "./types.js";
import { useCommentThreadOverlay } from "./useCommentThreadOverlay.js";

export function CommentThreadOverlay(
  props: CommentThreadOverlayProps,
): JSX.Element {
  const controller = useCommentThreadOverlay(props);
  return <CommentThreadOverlayView {...controller} />;
}
