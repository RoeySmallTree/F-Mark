import { useCallback, useState } from "react";
import { createClient, type RootScope } from "../../api/client.js";
import { ComposeAttachmentUploader } from "../ComposeAttachmentUploader.js";
import type { AttachmentSetter, StageFiles } from "./types.js";

interface UseComposeAttachmentUploadOptions {
  token: string | null;
  sessionId: string | null;
  userId: string | null;
  currentScope: RootScope | null;
  setAttachments: AttachmentSetter;
}

interface ComposeAttachmentUploadState {
  attachmentBusy: boolean;
  stageFiles: StageFiles;
}

export function useComposeAttachmentUpload({
  token,
  sessionId,
  userId,
  currentScope,
  setAttachments,
}: UseComposeAttachmentUploadOptions): ComposeAttachmentUploadState {
  const [attachmentBusy, setAttachmentBusy] = useState(false);

  const stageFiles = useCallback(
    async (files: File[]): Promise<void> => {
      if (files.length === 0 || sessionId === null) return;
      if (currentScope === null) return;

      const client = createClient({ baseUrl: "", token });
      const uploader = new ComposeAttachmentUploader({
        client,
        sessionId,
        userId,
        scope: currentScope,
        setAttachments,
      });

      setAttachmentBusy(true);
      try {
        for (const file of files) await uploader.stage(file);
      } finally {
        setAttachmentBusy(false);
      }
    },
    [currentScope, sessionId, setAttachments, token, userId],
  );

  return { attachmentBusy, stageFiles };
}
