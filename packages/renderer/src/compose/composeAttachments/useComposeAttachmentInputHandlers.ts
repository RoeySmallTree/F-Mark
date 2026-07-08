import {
  useCallback,
  type ChangeEvent,
  type ClipboardEvent,
  type MutableRefObject,
} from "react";
import { filesFromClipboard } from "../composeHelpers.js";
import { stageFilesInBackground } from "./uploadFailure.js";
import type { StageFiles } from "./types.js";

interface UseComposeAttachmentInputHandlersOptions {
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  stageFiles: StageFiles;
}

interface ComposeAttachmentInputHandlers {
  handleTextareaPaste(e: ClipboardEvent<HTMLTextAreaElement>): void;
  handleAttachClick(): void;
  handleFileInputChange(e: ChangeEvent<HTMLInputElement>): void;
}

export function useComposeAttachmentInputHandlers({
  fileInputRef,
  stageFiles,
}: UseComposeAttachmentInputHandlersOptions): ComposeAttachmentInputHandlers {
  const uploadFiles = useCallback(
    (files: File[]): void => stageFilesInBackground(stageFiles, files),
    [stageFiles],
  );

  const handleTextareaPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>): void => {
      const files = filesFromClipboard(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      uploadFiles(files);
    },
    [uploadFiles],
  );

  const handleAttachClick = useCallback((): void => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (files.length === 0) return;
      uploadFiles(files);
    },
    [uploadFiles],
  );

  return { handleTextareaPaste, handleAttachClick, handleFileInputChange };
}
