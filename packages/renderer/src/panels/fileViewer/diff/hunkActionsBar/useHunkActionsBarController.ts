import { useCallback, useMemo, useState } from "react";
import type { GitRevertAction, ProseMention } from "@f-mark/shared";
import { createClient } from "../../../../api/client.js";
import { useStore } from "../../../../state/store.js";
import { useConfirmDestructive } from "../../../../confirm/index.js";
import { useDefaultFileCommentMentions } from "../../lineComment/FileCommentDraftPopover.js";
import { useFileCommentPoster } from "../../lineComment/useFileCommentPoster.js";
import {
  fileActionLabel,
  hunkDiffText,
  hunkLineRange,
  hunkSnippet,
  revertConfirmDetail,
} from "./model.js";
import { revertHunkChange } from "./revert.js";
import type {
  HunkActionsBarController,
  HunkActionsBarProps,
} from "./types.js";

export function useHunkActionsBarController(
  props: HunkActionsBarProps,
): HunkActionsBarController {
  const {
    absPath,
    relPath,
    scope,
    wireMode,
    baseRef = null,
    diffBase,
    fileStatus,
    hunk,
    oldPath,
    sessionId,
    onReverted,
  } = props;
  const token = useStore((s) => s.token);
  const client = useMemo(() => createClient({ baseUrl: "", token }), [token]);
  const poster = useFileCommentPoster();
  const defaultMentions = useDefaultFileCommentMentions();
  const confirmDestructive = useConfirmDestructive();

  const [draftOpen, setDraftOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  const lines = useMemo(() => hunkLineRange(hunk), [hunk]);
  const snippet = useMemo(() => hunkSnippet(hunk), [hunk]);
  const fileTitle = absPath.split("/").pop() ?? absPath;

  const runRevert = useCallback(
    async (action: GitRevertAction): Promise<void> => {
      if (busy) return;
      const intent = await confirmDestructive({
        action: "git.revert",
        title: `${fileActionLabel(fileStatus)} — ${relPath}?`,
        detail: revertConfirmDetail(fileStatus),
      });
      if (intent === null) return;
      setBusy(true);
      setConflict(null);
      try {
        const error = await revertHunkChange({
          action,
          baseRef,
          client,
          hunk,
          oldPath,
          relPath,
          scope,
          sessionId,
          wireMode,
        });
        if (error === null) onReverted();
        else setConflict(error);
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      baseRef,
      client,
      confirmDestructive,
      fileStatus,
      hunk,
      oldPath,
      onReverted,
      relPath,
      scope,
      sessionId,
      wireMode,
    ],
  );

  const submitComment = useCallback(
    async (content: string, mentions: ProseMention[]): Promise<void> => {
      const filename = await poster.postFileComment({
        absPath,
        lines,
        content,
        diffBase,
        ...(hunk !== undefined ? { diffHunk: hunkDiffText(hunk) } : {}),
        ...(mentions.length > 0 ? { mentions } : {}),
      });
      if (filename !== null) setDraftOpen(false);
    },
    [absPath, diffBase, hunk, lines, poster],
  );

  return {
    busy,
    canPost: poster.canPost,
    conflict,
    defaultMentions,
    draftOpen,
    fileTitle,
    lines,
    posterBusy: poster.busy,
    snippet,
    closeDraft: () => setDraftOpen(false),
    runRevert,
    submitComment,
    toggleDraft: () => setDraftOpen((value) => !value),
  };
}
