import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type MutableRefObject,
  type RefObject,
} from "react";
import type { RootScope } from "../api/client.js";
import type { StagedAttachment } from "./AttachmentChip.js";
import type { ComposeDragMode } from "./composeHelpers.js";
import { useComposeAttachmentDragHandlers } from "./composeAttachments/useComposeAttachmentDragHandlers.js";
import { useComposeAttachmentInputHandlers } from "./composeAttachments/useComposeAttachmentInputHandlers.js";
import { useComposeAttachmentRemoval } from "./composeAttachments/useComposeAttachmentRemoval.js";
import { useComposeAttachmentSessionReset } from "./composeAttachments/useComposeAttachmentSessionReset.js";
import { useComposeAttachmentUpload } from "./composeAttachments/useComposeAttachmentUpload.js";

interface UseComposeAttachmentsOptions {
  token: string | null;
  sessionId: string | null;
  userId: string | null;
  currentScope: RootScope | null;
  textareaRef: RefObject<HTMLTextAreaElement>;
  appendDroppedPath(path: string): void;
}

export interface ComposeAttachmentsState {
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  attachments: StagedAttachment[];
  attachmentBusy: boolean;
  attachmentErrors: Array<StagedAttachment & { error: string }>;
  hasAttachments: boolean;
  draggingMode: ComposeDragMode | null;
  isDraggingFiles: boolean;
  discardAttachments(ids: Set<string>): void;
  removeAttachment(id: string): void;
  handleTextareaPaste(e: ClipboardEvent<HTMLTextAreaElement>): void;
  handleAttachClick(): void;
  handleFileInputChange(e: ChangeEvent<HTMLInputElement>): void;
  handleDragEnter(e: DragEvent<HTMLDivElement>): void;
  handleDragLeave(e: DragEvent<HTMLDivElement>): void;
  handleDragOver(e: DragEvent<HTMLDivElement>): void;
  handleDrop(e: DragEvent<HTMLDivElement>): void;
}

export function useComposeAttachments({
  token,
  sessionId,
  userId,
  currentScope,
  textareaRef,
  appendDroppedPath,
}: UseComposeAttachmentsOptions): ComposeAttachmentsState {
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const attachmentErrors = useMemo(
    () =>
      attachments.filter(
        (attachment): attachment is StagedAttachment & { error: string } =>
          typeof attachment.error === "string" && attachment.error.length > 0,
      ),
    [attachments],
  );
  const hasAttachments = attachments.length > 0;

  const { attachmentBusy, stageFiles } = useComposeAttachmentUpload({
    token,
    sessionId,
    userId,
    currentScope,
    setAttachments,
  });

  const { discardAttachments, removeAttachment } = useComposeAttachmentRemoval({
    attachments,
    token,
    sessionId,
    currentScope,
    setAttachments,
  });

  const { handleTextareaPaste, handleAttachClick, handleFileInputChange } =
    useComposeAttachmentInputHandlers({ fileInputRef, stageFiles });

  const {
    draggingMode,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } = useComposeAttachmentDragHandlers({
    textareaRef,
    appendDroppedPath,
    stageFiles,
  });
  const isDraggingFiles = draggingMode !== null;

  useComposeAttachmentSessionReset({ sessionId, setAttachments });

  return {
    fileInputRef,
    attachments,
    attachmentBusy,
    attachmentErrors,
    hasAttachments,
    draggingMode,
    isDraggingFiles,
    discardAttachments,
    removeAttachment,
    handleTextareaPaste,
    handleAttachClick,
    handleFileInputChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  };
}
