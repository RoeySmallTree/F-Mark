/* CommentThreadOverlay -- public facade for the focused comment-thread view.
   Keep this path stable: other renderer code and tests import from
   overlays/CommentThreadOverlay.js. */

export {
  CommentThreadOverlay,
  isResolvedComment,
} from "./commentThreadOverlay/index.js";
