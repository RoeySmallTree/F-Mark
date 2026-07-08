import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from "react";
import {
  detectComposeDragMode,
  type ComposeDragMode,
} from "../composeHelpers.js";
import { stageFilesInBackground } from "./uploadFailure.js";
import type { StageFiles } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  copy: "copy",
  fmarkPath: "fmark-path",
} as const;

interface UseComposeAttachmentDragHandlersOptions {
  textareaRef: RefObject<HTMLTextAreaElement>;
  appendDroppedPath(path: string): void;
  stageFiles: StageFiles;
}

interface ComposeAttachmentDragHandlers {
  draggingMode: ComposeDragMode | null;
  handleDragEnter(e: DragEvent<HTMLDivElement>): void;
  handleDragLeave(e: DragEvent<HTMLDivElement>): void;
  handleDragOver(e: DragEvent<HTMLDivElement>): void;
  handleDrop(e: DragEvent<HTMLDivElement>): void;
}

export function useComposeAttachmentDragHandlers({
  textareaRef,
  appendDroppedPath,
  stageFiles,
}: UseComposeAttachmentDragHandlersOptions): ComposeAttachmentDragHandlers {
  const [draggingMode, setDraggingMode] = useState<ComposeDragMode | null>(null);
  const dragCounterRef = useRef(0);

  const resetDragging = useCallback((): void => {
    dragCounterRef.current = 0;
    setDraggingMode(null);
  }, []);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>): void => {
    const mode = detectComposeDragMode(e.dataTransfer);
    if (mode === null) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setDraggingMode(mode);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>): void => {
    const mode = detectComposeDragMode(e.dataTransfer);
    if (mode === null) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDraggingMode(null);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>): void => {
    const mode = detectComposeDragMode(e.dataTransfer);
    if (mode === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = NO_LOOSE_STRING_VALUES.copy;
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      const mode = detectComposeDragMode(e.dataTransfer);
      if (mode === null) return;
      e.preventDefault();
      resetDragging();

      if (mode === NO_LOOSE_STRING_VALUES.fmarkPath) {
        appendPathDrop(e, appendDroppedPath, textareaRef);
        return;
      }

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      stageFilesInBackground(stageFiles, files);
    },
    [appendDroppedPath, resetDragging, stageFiles, textareaRef],
  );

  return {
    draggingMode,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  };
}

function appendPathDrop(
  e: DragEvent<HTMLDivElement>,
  appendDroppedPath: (path: string) => void,
  textareaRef: RefObject<HTMLTextAreaElement>,
): void {
  const path = e.dataTransfer.getData("application/x-fmark-file-path");
  if (path.length === 0) return;
  appendDroppedPath(path);
  queueMicrotask(() => textareaRef.current?.focus());
}
