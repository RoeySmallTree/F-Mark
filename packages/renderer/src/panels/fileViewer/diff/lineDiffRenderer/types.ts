import type {
  DiffBase,
  GitDiffMode,
  GitDiffResponse,
  GitFileActions,
  GitFileStatus,
} from "@f-mark/shared";
import type { RootScope } from "../../../../api/rootScope.js";
import type { FileViewerDiffStyle } from "../../../../state/store.js";

export interface LineDiffRendererProps {
  path: string;
  /** Server diff resolved by the FileViewer (useDiffOutcome). */
  diff: GitDiffResponse;
  wireMode: GitDiffMode;
  style: FileViewerDiffStyle;
  baseRef?: string | null;
  sessionId: string | null;
  /** Called after a successful revert so the shared diff re-fetches. */
  onReverted: () => void;
}

export interface ParsedLine {
  kind: "add" | "del" | "ctx";
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

export const LINE_DIFF_KINDS = {
  add: "add",
  delete: "del",
  context: "ctx",
} as const satisfies Record<string, ParsedLine["kind"]>;

export interface LineDiffActionContext {
  path: string;
  relPath: string;
  scope: RootScope;
  wireMode: GitDiffMode;
  baseRef: string | null;
  diffBase: DiffBase;
  fileStatus: GitFileStatus;
  actions: GitFileActions;
  oldPathProp: { oldPath?: string };
  sessionId: string | null;
  onReverted: () => void;
}
