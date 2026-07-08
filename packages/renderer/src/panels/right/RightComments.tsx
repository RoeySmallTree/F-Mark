import type { JSX } from "react";
import { RightCommentsView } from "./comments/RightCommentsView.js";
import { useRightCommentsController } from "./comments/useRightCommentsController.js";
import { TabEmptyState } from "./TabEmptyState.js";

const NO_LOOSE_STRING_VALUES = {
  comments: "comments",
  rightCommentsEmpty: "right-comments-empty",
} as const;

export function RightComments(): JSX.Element {
  const controller = useRightCommentsController();

  if (controller.groups.length === 0) {
    return (
      <TabEmptyState
        variant={NO_LOOSE_STRING_VALUES.comments}
        fill
        className={NO_LOOSE_STRING_VALUES.rightCommentsEmpty}
        testId={NO_LOOSE_STRING_VALUES.rightCommentsEmpty}
      />
    );
  }

  return <RightCommentsView controller={controller} />;
}
