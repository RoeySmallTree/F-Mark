import { type JSX } from "react";
import type { ComposeRootController } from "./types.js";
import { ComposeToolbarBridge } from "./ComposeToolbarBridge.js";

const NO_LOOSE_STRING_VALUES = {
  named: "named",
} as const;

interface Props {
  controller: ComposeRootController;
}

export function ComposeMessageBox({ controller }: Props): JSX.Element {
  const { activeMode, textDraft } = controller.core;
  const { attachments, submission } = controller.services;
  const { actions } = controller;

  return (
    <div className="compose-box">
      <textarea
        ref={textDraft.textareaRef}
        value={textDraft.content}
        onChange={actions.onTextareaChange}
        onClick={actions.onTextareaClick}
        onKeyDown={actions.onTextareaKey}
        onPaste={attachments.handleTextareaPaste}
        placeholder={actions.placeholder}
        rows={activeMode === NO_LOOSE_STRING_VALUES.named ? 4 : 1}
        aria-label="Compose message"
        /* readOnly, not disabled: a disabled textarea drops focus mid-typing,
           which would be its own bug the moment a request resolves while the
           user has already started their next message. readOnly blocks
           further keystrokes (including a second Enter reaching the send
           handler at all) without moving focus, and the dimmed opacity below
           gives the "nothing happens on Enter" moment a visible reason. */
        readOnly={submission.busy}
        aria-busy={submission.busy}
      />
      <input
        ref={attachments.fileInputRef}
        type="file"
        multiple
        hidden
        onChange={attachments.handleFileInputChange}
        aria-hidden
        tabIndex={-1}
      />
      <ComposeToolbarBridge controller={controller} />
    </div>
  );
}
