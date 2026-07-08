import { useCallback } from "react";
import { createClient, type RootScope } from "../../api/client.js";
import type { StagedAttachment } from "../AttachmentChip.js";
import { revokeAttachmentPreview } from "./previewLifecycle.js";
import type { AttachmentSetter } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  tmp: "tmp_",
} as const;

interface UseComposeAttachmentRemovalOptions {
  attachments: StagedAttachment[];
  token: string | null;
  sessionId: string | null;
  currentScope: RootScope | null;
  setAttachments: AttachmentSetter;
}

interface ComposeAttachmentRemovalHandlers {
  discardAttachments(ids: Set<string>): void;
  removeAttachment(id: string): void;
}

export function useComposeAttachmentRemoval({
  attachments,
  token,
  sessionId,
  currentScope,
  setAttachments,
}: UseComposeAttachmentRemovalOptions): ComposeAttachmentRemovalHandlers {
  const discardAttachments = useCallback(
    (ids: Set<string>): void => {
      setAttachments((prev) => removeAttachmentsById(prev, ids));
    },
    [setAttachments],
  );

  const removeAttachment = useCallback(
    (id: string): void => {
      if (sessionId === null) return;
      const target = attachments.find((attachment) => attachment.id === id);
      if (target === undefined) return;

      revokeAttachmentPreview(target);
      setAttachments((prev) =>
        prev.filter((attachment) => attachment.id !== id),
      );
      deleteUploadedAttachment({
        attachment: target,
        currentScope,
        sessionId,
        token,
      });
    },
    [attachments, currentScope, sessionId, setAttachments, token],
  );

  return { discardAttachments, removeAttachment };
}

function removeAttachmentsById(
  attachments: StagedAttachment[],
  ids: Set<string>,
): StagedAttachment[] {
  for (const attachment of attachments) {
    if (ids.has(attachment.id)) revokeAttachmentPreview(attachment);
  }
  return attachments.filter((attachment) => !ids.has(attachment.id));
}

interface DeleteUploadedAttachmentOptions {
  attachment: StagedAttachment;
  currentScope: RootScope | null;
  sessionId: string;
  token: string | null;
}

function deleteUploadedAttachment({
  attachment,
  currentScope,
  sessionId,
  token,
}: DeleteUploadedAttachmentOptions): void {
  if (
    attachment.uploading ||
    attachment.error ||
    attachment.id.startsWith(NO_LOOSE_STRING_VALUES.tmp)
  ) {
    return;
  }

  const client = createClient({ baseUrl: "", token });
  void client
    .deleteAttachment(sessionId, attachment.id, currentScope ?? undefined)
    .catch((err: unknown) => console.error("Attachment delete failed", err));
}
