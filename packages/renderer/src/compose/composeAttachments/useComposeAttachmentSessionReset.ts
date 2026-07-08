import { useEffect } from "react";
import { revokeAttachmentPreviews } from "./previewLifecycle.js";
import type { AttachmentSetter } from "./types.js";

interface UseComposeAttachmentSessionResetOptions {
  sessionId: string | null;
  setAttachments: AttachmentSetter;
}

export function useComposeAttachmentSessionReset({
  sessionId,
  setAttachments,
}: UseComposeAttachmentSessionResetOptions): void {
  useEffect(() => {
    setAttachments((prev) => {
      revokeAttachmentPreviews(prev);
      return [];
    });
  }, [sessionId, setAttachments]);
}
