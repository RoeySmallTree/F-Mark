import type { JSX } from "react";
import { HunkActionsBarView } from "./hunkActionsBar/HunkActionsBarView.js";
import { useHunkActionsBarController } from "./hunkActionsBar/useHunkActionsBarController.js";
import type { HunkActionsBarProps } from "./hunkActionsBar/types.js";

export type { HunkActionsBarProps } from "./hunkActionsBar/types.js";

export function HunkActionsBar(props: HunkActionsBarProps): JSX.Element {
  const controller = useHunkActionsBarController(props);
  return (
    <HunkActionsBarView
      controller={controller}
      props={props}
    />
  );
}
