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
}

export interface ActionStripCommonProps
  extends Omit<MonacoDiffActionStripsProps, "diff"> {
  diff: GitDiffResponse;
  oldPathProp: { oldPath?: string };
}
