import type { CSSProperties } from "react";
import type { ProseMention } from "@f-mark/shared";
import { FileCommentDraftPopover } from "../../lineComment/FileCommentDraftPopover.js";
import type { MonacoDraftState } from "./types.js";

export function MonacoLineCommentDraft({
  path,
  draft,
  snippet,
  busy,
  defaultMentions,
  onSubmit,
  onClose,
}: {
  path: string;
  draft: MonacoDraftState | null;
  snippet: string;
  busy: boolean;
  defaultMentions: ProseMention[];
  onSubmit: (content: string, mentions: ProseMention[]) => void;
  onClose: () => void;
}): JSX.Element | null {
  if (draft === null) return null;
  const style: CSSProperties = {
    top: Math.max(8, draft.top),
  };
  const title = path.split("/").pop() ?? path;
  return (
    <FileCommentDraftPopover
      title={title}
      lines={draft.lines}
      snippet={snippet}
      busy={busy}
      defaultMentions={defaultMentions}
      className="fv-monaco-comment-popover"
      style={style}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  );
}
