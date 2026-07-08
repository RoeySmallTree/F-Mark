import type { JSX } from "react";

import { GitDiffMessage } from "./GitDiffMessage.js";
import { GitDiffOverrideForm } from "./GitDiffOverrideForm.js";
import { GitDiffSettingsRows } from "./GitDiffSettingsRows.js";
import type { GitDiffPanelController } from "./useGitDiffPanelController.js";

interface GitDiffPanelViewProps {
  controller: GitDiffPanelController;
}

export function GitDiffPanelView({
  controller,
}: GitDiffPanelViewProps): JSX.Element {
  if (controller.scope === null) {
    return (
      <section className="settings-section" aria-label="Git/Diff">
        <h2 className="settings-h">Git / Diff</h2>
        <p className="settings-muted">Open a project to configure its diff base ref.</p>
      </section>
    );
  }

  return (
    <section aria-label="Git/Diff">
      <h3 className="settings-h">Git / Diff</h3>
      <div className="settings-sub">
        The base ref pins how branch-mode diffs compute their merge-base. Leave
        the override empty to auto-detect (origin/HEAD → main → master).
      </div>

      <GitDiffSettingsRows
        activePath={controller.activePath}
        settings={controller.settings}
      />
      <GitDiffOverrideForm
        busy={controller.busy}
        dirty={controller.dirty}
        hasSavedOverride={controller.hasSavedOverride}
        isNotGit={controller.isNotGit}
        onClear={controller.clearOverride}
        onOverrideChange={controller.setOverride}
        onSave={controller.saveOverride}
        onValidate={controller.validateOverride}
        override={controller.override}
        trimmedOverride={controller.trimmedOverride}
      />
      <GitDiffMessage message={controller.message} />
    </section>
  );
}
