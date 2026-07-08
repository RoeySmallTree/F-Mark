import { type JSX } from "react";
import { ComposeAttachmentsView } from "../ComposeAttachmentsView.js";
import { NameChip } from "../NameChip.js";
import type { ComposeRootController } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  named: "named",
} as const;

interface Props {
  controller: ComposeRootController;
}

export function ComposeDraftHeader({ controller }: Props): JSX.Element {
  const { activeMode, setMode, textDraft } = controller.core;
  const { attachments } = controller.services;
  const shouldShowName = textDraft.content.length > 0 || activeMode === NO_LOOSE_STRING_VALUES.named;

  return (
    <>
      {shouldShowName ? (
        <NameChip
          active={activeMode === NO_LOOSE_STRING_VALUES.named}
          value={textDraft.name}
          onChange={textDraft.setName}
          onActivate={() => setMode(NO_LOOSE_STRING_VALUES.named)}
          onCancel={textDraft.onCancelName}
        />
      ) : null}
      <ComposeAttachmentsView
        attachments={attachments.attachments}
        attachmentErrors={attachments.attachmentErrors}
        onRemove={attachments.removeAttachment}
      />
    </>
  );
}
