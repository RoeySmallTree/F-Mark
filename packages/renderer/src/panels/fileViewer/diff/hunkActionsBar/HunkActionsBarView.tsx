import { MessageSquarePlus, Undo2 } from "lucide-react";
import type { GitRevertAction } from "@f-mark/shared";
import { FileCommentDraftPopover } from "../../lineComment/FileCommentDraftPopover.js";
import { fileActionLabel, hunkActionLabel } from "./model.js";
import type {
  HunkActionsBarController,
  HunkActionsBarProps,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  hunk: "hunk",
  working: "Working…",
  rename: "rename",
  fvHunkRenameRevert: "fv-hunk-rename-revert",
  file: "file",
  fvHunkFileRevert: "fv-hunk-file-revert",
} as const;

export interface HunkActionsBarViewProps {
  controller: HunkActionsBarController;
  props: HunkActionsBarProps;
}

export function HunkActionsBarView({
  controller,
  props,
}: HunkActionsBarViewProps): JSX.Element {
  const {
    actions,
    fileLevelOnly,
    fileStatus,
    hideFileAction,
    hunk,
    style,
  } = props;

  return (
    <div className="fv-hunk-actions" style={style} data-testid="fv-hunk-actions">
      {!fileLevelOnly && hunk !== undefined ? (
        <button
          type="button"
          className="fv-hunk-action"
          onClick={controller.toggleDraft}
          disabled={!controller.canPost}
          title="Comment on this hunk"
          data-testid="fv-hunk-comment"
        >
          <MessageSquarePlus size={12} aria-hidden />
          Comment
        </button>
      ) : null}

      {actions.hunk && hunk !== undefined && !fileLevelOnly ? (
        <button
          type="button"
          className="fv-hunk-action"
          onClick={() => void controller.runRevert(NO_LOOSE_STRING_VALUES.hunk)}
          disabled={controller.busy}
          title={
            fileStatus === "deleted"
              ? "Restore this hunk's lines"
              : "Reverse-apply this hunk"
          }
          data-testid="fv-hunk-revert"
        >
          <Undo2 size={12} aria-hidden />
          {controller.busy ? NO_LOOSE_STRING_VALUES.working : hunkActionLabel(fileStatus)}
        </button>
      ) : null}

      {actions.rename && !hideFileAction ? (
        <RevertActionButton
          action={NO_LOOSE_STRING_VALUES.rename}
          busy={controller.busy}
          className="fv-hunk-action"
          label="Undo rename"
          testId={NO_LOOSE_STRING_VALUES.fvHunkRenameRevert}
          title="Move the file back to its original path"
          onRun={controller.runRevert}
        />
      ) : null}

      {actions.file && !hideFileAction ? (
        <RevertActionButton
          action={NO_LOOSE_STRING_VALUES.file}
          busy={controller.busy}
          className="fv-hunk-action is-file"
          label={fileActionLabel(fileStatus)}
          testId={NO_LOOSE_STRING_VALUES.fvHunkFileRevert}
          title={`${fileActionLabel(fileStatus)} from base`}
          onRun={controller.runRevert}
        />
      ) : null}

      {controller.conflict !== null ? (
        <span className="fv-hunk-conflict" role="alert" data-testid="fv-hunk-conflict">
          {controller.conflict}
        </span>
      ) : null}

      {controller.draftOpen && hunk !== undefined ? (
        <FileCommentDraftPopover
          title={controller.fileTitle}
          lines={controller.lines}
          snippet={controller.snippet}
          busy={controller.posterBusy}
          defaultMentions={controller.defaultMentions}
          className="fv-hunk-comment-popover"
          onSubmit={(content, mentions) => void controller.submitComment(content, mentions)}
          onClose={controller.closeDraft}
        />
      ) : null}
    </div>
  );
}

interface RevertActionButtonProps {
  action: GitRevertAction;
  busy: boolean;
  className: string;
  label: string;
  testId: string;
  title: string;
  onRun(action: GitRevertAction): Promise<void>;
}

function RevertActionButton({
  action,
  busy,
  className,
  label,
  testId,
  title,
  onRun,
}: RevertActionButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={className}
      onClick={() => void onRun(action)}
      disabled={busy}
      title={title}
      data-testid={testId}
    >
      <Undo2 size={12} aria-hidden />
      {busy ? NO_LOOSE_STRING_VALUES.working : label}
    </button>
  );
}
