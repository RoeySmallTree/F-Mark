import type { StagedAttachment } from "../AttachmentChip.js";

export function revokeAttachmentPreview(attachment: StagedAttachment): void {
  if (attachment.previewUrl !== null) URL.revokeObjectURL(attachment.previewUrl);
}

export function revokeAttachmentPreviews(
  attachments: StagedAttachment[],
): void {
  for (const attachment of attachments) revokeAttachmentPreview(attachment);
}
