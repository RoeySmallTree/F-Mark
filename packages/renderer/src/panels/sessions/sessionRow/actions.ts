import type {
  DragEvent,
  KeyboardEvent,
  MouseEvent,
} from "react";
import {
  clearDragSource,
  setCircularDragImage,
} from "../../../drag/dragPreview.js";
import {
  droppedSessionId,
  hasSessionDragType,
  sanitizeRenameValue,
  SESSION_DRAG_MIME,
} from "./model.js";
import type { SessionRowProps } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  move: "move",
  f2: "F2",
} as const;

export interface SessionRowActions {
  handleClick: () => void;
  handleContextMenu: (event: MouseEvent<HTMLDivElement>) => void;
  handleContextMenuButtonClick: (
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  handleDoubleClick: (event: MouseEvent<HTMLDivElement>) => void;
  handleDragEnd: () => void;
  handleDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  handleDragOver: (event: DragEvent<HTMLDivElement>) => void;
  handleDragStart: (event: DragEvent<HTMLDivElement>) => void;
  handleDrop: (event: DragEvent<HTMLDivElement>) => void;
  handleForkClick: (event: MouseEvent<HTMLButtonElement>) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  handleRenameValueChange: (value: string) => void;
  handleSaveRename: () => void;
  handleCancelRename: () => void;
}

export function createSessionRowActions(
  props: SessionRowProps,
): SessionRowActions {
  const {
    draggingSessionId,
    dropTargetSessionId,
    renaming,
    repoKey,
    session,
    onBeginRename,
    onCancelRename,
    onMoveSessionInRepo,
    onOpenContextMenu,
    onOpenFork,
    onRenameValueChange,
    onSaveRename,
    onSelect,
    setDraggingSessionId,
    setDropTargetSessionId,
  } = props;

  function clearDragState(): void {
    setDraggingSessionId(null);
    setDropTargetSessionId(null);
    clearDragSource();
  }

  function handleClick(): void {
    if (renaming) return;
    void onSelect(session);
  }

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    onBeginRename(session);
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    onOpenContextMenu(event.clientX, event.clientY, session);
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>): void {
    setDraggingSessionId(session.id);
    event.dataTransfer.effectAllowed = NO_LOOSE_STRING_VALUES.move;
    event.dataTransfer.setData(SESSION_DRAG_MIME, session.id);
    event.dataTransfer.setData("text/plain", session.id);
    setCircularDragImage(event.dataTransfer, event.currentTarget, {
      label: session.slug,
      fallbackText: "S",
    });
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    const hasSessionDrag =
      draggingSessionId !== null || hasSessionDragType(event.dataTransfer.types);
    if (!hasSessionDrag) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = NO_LOOSE_STRING_VALUES.move;
    if (dropTargetSessionId !== session.id) {
      setDropTargetSessionId(session.id);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>): void {
    const related = event.relatedTarget as Node | null;
    if (
      dropTargetSessionId === session.id &&
      (related === null || !event.currentTarget.contains(related))
    ) {
      setDropTargetSessionId(null);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    const fromId = droppedSessionId(event.dataTransfer, draggingSessionId);
    if (fromId !== null && fromId.length > 0) {
      onMoveSessionInRepo(repoKey, fromId, session.id);
    }
    clearDragState();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (renaming) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void onSelect(session);
    } else if (event.key === NO_LOOSE_STRING_VALUES.f2) {
      event.preventDefault();
      onBeginRename(session);
    }
  }

  function handleForkClick(event: MouseEvent<HTMLButtonElement>): void {
    onOpenFork(event, session);
  }

  function handleContextMenuButtonClick(
    event: MouseEvent<HTMLButtonElement>,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    onOpenContextMenu(event.clientX, event.clientY, session);
  }

  function handleRenameValueChange(value: string): void {
    onRenameValueChange(sanitizeRenameValue(value));
  }

  function handleSaveRename(): void {
    void onSaveRename(session);
  }

  return {
    handleClick,
    handleContextMenu,
    handleContextMenuButtonClick,
    handleDoubleClick,
    handleDragEnd: clearDragState,
    handleDragLeave,
    handleDragOver,
    handleDragStart,
    handleDrop,
    handleForkClick,
    handleKeyDown,
    handleRenameValueChange,
    handleSaveRename,
    handleCancelRename: onCancelRename,
  };
}
