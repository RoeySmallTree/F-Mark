import { type JSX } from "react";
import { AttachmentChip, type StagedAttachment } from "./AttachmentChip.js";

interface Props {
  attachments: StagedAttachment[];
  attachmentErrors: Array<StagedAttachment & { error: string }>;
  onRemove(id: string): void;
}

export function ComposeAttachmentsView({
  attachments,
  attachmentErrors,
  onRemove,
}: Props): JSX.Element | null {
  if (attachments.length === 0 && attachmentErrors.length === 0) return null;
  return (
    <>
      {attachments.length > 0 ? (
        <div className="compose-attachments" role="list">
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.id}
              attachment={attachment}
              onRemove={onRemove}
            />
          ))}
        </div>
      ) : null}
      {attachmentErrors.length > 0 ? (
        <div
          className="compose-attachment-errors"
          role="alert"
          aria-live="polite"
        >
          {attachmentErrors.map((attachment) => (
            <div className="compose-attachment-error" key={attachment.id}>
              <span className="compose-attachment-error-name">
                {attachment.displayName}
              </span>
              <span className="compose-attachment-error-message">
                {attachment.error}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
