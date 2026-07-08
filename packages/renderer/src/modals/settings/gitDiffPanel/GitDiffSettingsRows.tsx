import { GitBranch } from "lucide-react";
import type { JSX } from "react";
import type { GitDiffSettingsResponse } from "@f-mark/shared";

import { shortGitSha } from "./model.js";

interface GitDiffSettingsRowsProps {
  activePath: string | null;
  settings: GitDiffSettingsResponse | null;
}

export function GitDiffSettingsRows({
  activePath,
  settings,
}: GitDiffSettingsRowsProps): JSX.Element {
  return (
    <div className="git-diff-rows">
      <div className="git-diff-row">
        <span className="git-diff-label">Project</span>
        <span className="git-diff-value mono">{settings?.root ?? activePath}</span>
      </div>
      <div className="git-diff-row">
        <span className="git-diff-label">Detected base</span>
        <span className="git-diff-value">
          <GitBranch size={12} aria-hidden />{" "}
          {settings?.detected_base_ref ?? "—"}
        </span>
      </div>
      <div className="git-diff-row">
        <span className="git-diff-label">Effective base</span>
        <span className="git-diff-value">{settings?.effective_base_ref ?? "—"}</span>
      </div>
      <div className="git-diff-row">
        <span className="git-diff-label">Merge-base sha</span>
        <span className="git-diff-value mono">
          {shortGitSha(settings?.merge_base_sha)}
        </span>
      </div>
      <div className="git-diff-row">
        <span className="git-diff-label">Status</span>
        <span className={`git-diff-status is-${settings?.status ?? "ok"}`}>
          {settings?.status ?? "—"}
        </span>
      </div>
    </div>
  );
}
