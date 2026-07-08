import { AlertTriangle, Check } from "lucide-react";
import type { JSX } from "react";

import type { GitDiffPanelMessage } from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  ok: "ok",
} as const;

interface GitDiffMessageProps {
  message: GitDiffPanelMessage | null;
}

export function GitDiffMessage({
  message,
}: GitDiffMessageProps): JSX.Element | null {
  if (message === null) return null;

  return (
    <p className={`git-diff-msg is-${message.kind}`}>
      {message.kind === NO_LOOSE_STRING_VALUES.ok ? (
        <Check size={12} aria-hidden />
      ) : (
        <AlertTriangle size={12} aria-hidden />
      )}{" "}
      {message.text}
    </p>
  );
}
