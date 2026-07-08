/* Git/Diff settings section (expansion-decisions.md X5). Shows the current
   project, the detected default base, the effective merge-base sha, and an
   override input with Validate / Save / Clear. The override is a PROJECT
   setting (kernel git endpoints + standalone tabs + all renderer tabs read
   it), stored in the project config -- never localStorage. */

import type { JSX } from "react";

import { GitDiffPanelView } from "./gitDiffPanel/GitDiffPanelView.js";
import { useGitDiffPanelController } from "./gitDiffPanel/useGitDiffPanelController.js";

export function GitDiffPanel(): JSX.Element {
  return <GitDiffPanelView controller={useGitDiffPanelController()} />;
}
