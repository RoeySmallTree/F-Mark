const NO_LOOSE_STRING_VALUES = {
  sessionItem: "session-item",
  staggeredRow: "staggered-row",
  active: "active",
  switching: "switching",
  dragging: "dragging",
} as const;

export const SESSION_DRAG_MIME = "application/x-fmark-session";

interface SessionRowClassNameInput {
  active: boolean;
  dragging: boolean;
  switching: boolean;
}

export function sessionRowClassName(input: SessionRowClassNameInput): string {
  return [
    NO_LOOSE_STRING_VALUES.sessionItem,
    NO_LOOSE_STRING_VALUES.staggeredRow,
    input.active ? NO_LOOSE_STRING_VALUES.active : "",
    input.switching ? NO_LOOSE_STRING_VALUES.switching : "",
    input.dragging ? NO_LOOSE_STRING_VALUES.dragging : "",
  ]
    .join(" ")
    .trim();
}

export function dropBeforeValue(
  dropTargetSessionId: string | null,
  draggingSessionId: string | null,
  sessionId: string,
): "true" | undefined {
  return dropTargetSessionId === sessionId && draggingSessionId !== sessionId
    ? "true"
    : undefined;
}

export function hasSessionDragType(
  types: Iterable<string> | null | undefined,
): boolean {
  if (types === null || types === undefined) return false;

  for (const type of types) {
    if (type === SESSION_DRAG_MIME) return true;
  }
  return false;
}

export function droppedSessionId(
  dataTransfer: DataTransfer,
  fallbackSessionId: string | null,
): string | null {
  return (
    dataTransfer.getData(SESSION_DRAG_MIME) ||
    dataTransfer.getData("text/plain") ||
    fallbackSessionId
  );
}

export function sanitizeRenameValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "");
}
