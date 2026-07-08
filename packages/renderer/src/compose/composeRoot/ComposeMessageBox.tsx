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
  const { attachments } = controller.services;
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
