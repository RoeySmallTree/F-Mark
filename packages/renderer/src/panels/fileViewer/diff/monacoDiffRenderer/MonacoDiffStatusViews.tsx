import type { GitFileVersionResponse } from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  notGit: "not-git",
  baseNotFound: "base-not-found",
} as const;

export function MonacoDiffError({ error }: { error: string }): JSX.Element {
  return <div className="fv-error">failed to load diff: {error}</div>;
}

export function getMonacoDiffUnavailableView(
  version: GitFileVersionResponse,
): JSX.Element | null {
  if (version.status === NO_LOOSE_STRING_VALUES.notGit) {
    return <div className="fv-empty"><p>Not a git repository.</p></div>;
  }
  if (version.status === NO_LOOSE_STRING_VALUES.baseNotFound) {
    return (
      <div className="fv-empty">
        <p>No base ref found.</p>
        <p className="fv-empty-hint">
          Set a base ref in Git/Diff settings to enable branch diffs.
        </p>
      </div>
    );
  }
  if (version.binary) {
    return (
      <div className="fv-empty"><p>Binary file — no text diff available.</p></div>
    );
  }
  return null;
}

export function MonacoDiffTruncatedNotice({
  truncated,
}: {
  truncated: boolean;
}): JSX.Element | null {
  return truncated ? (
    <div className="fv-loading">diff truncated — open externally for the full file</div>
  ) : null;
}
