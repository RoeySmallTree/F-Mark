import type {
  DiffBase,
  GitDiffMode,
  GitDiffResponse,
  GitFileActions,
  GitFileStatus,
} from "@f-mark/shared";
import type { RootScope } from "../../../../api/rootScope.js";

export interface MonacoDiffActionStripsProps {
  path: string;
  relPath: string;
  scope: RootScope;
  diff: GitDiffResponse;
  wireMode: GitDiffMode;
  baseRef: string | null;
  diffBase: DiffBase;
  fileStatus: GitFileStatus;
  actions: GitFileActions;
  sessionId: string | null;
  onReverted: () => void;
  /** Clears the Monaco diff editor's model right before a revert mutation
      runs, so the widget isn't left holding a disposed model once the
      refreshed base/working text lands (M16a). */
  onBeforeRevert: () => void;
}

export interface ActionStripCommonProps
  extends Omit<MonacoDiffActionStripsProps, "diff"> {
  diff: GitDiffResponse;
  oldPathProp: { oldPath?: string };
}
