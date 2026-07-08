import type { JSX } from "react";
import { formatRelative } from "../model.js";
import { createSessionRowActions } from "./actions.js";
import { SessionBeacon } from "./SessionBeacon.js";
import { SessionRenameEditor } from "./SessionRenameEditor.js";
import { SessionRowControls } from "./SessionRowControls.js";
import {
  dropBeforeValue,
  sessionRowClassName,
} from "./model.js";
import type { SessionRowProps } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  i: "--i",
} as const;

export function SessionRowView(props: SessionRowProps): JSX.Element {
  const {
    active,
    badge,
    draggingSessionId,
    dropTargetSessionId,
    now,
    renameValue,
    renaming,
    rowIndex,
    session,
    switching,
  } = props;
  const actions = createSessionRowActions(props);

  return (
    <div
      role="button"
      tabIndex={0}
      className={sessionRowClassName({
        active,
        switching,
        dragging: draggingSessionId === session.id,
      })}
      data-drop-before={dropBeforeValue(
        dropTargetSessionId,
        draggingSessionId,
        session.id,
      )}
      style={{ [NO_LOOSE_STRING_VALUES.i as string]: rowIndex }}
      draggable={!renaming}
      onClick={actions.handleClick}
      onDoubleClick={actions.handleDoubleClick}
      onContextMenu={actions.handleContextMenu}
      onDragStart={actions.handleDragStart}
      onDragOver={actions.handleDragOver}
      onDragLeave={actions.handleDragLeave}
      onDrop={actions.handleDrop}
      onDragEnd={actions.handleDragEnd}
      onKeyDown={actions.handleKeyDown}
      aria-pressed={active}
      aria-busy={switching}
    >
      <div className="row1">
        <SessionBeacon badge={badge} />
        {renaming ? (
          <SessionRenameEditor
            renameValue={renameValue}
            sessionSlug={session.slug}
            onCancel={actions.handleCancelRename}
            onRenameValueChange={actions.handleRenameValueChange}
            onSave={actions.handleSaveRename}
          />
        ) : (
          <span className="slug">{session.slug}</span>
        )}
        <SessionRowControls
          sessionSlug={session.slug}
          onOpenContextMenu={actions.handleContextMenuButtonClick}
          onOpenFork={actions.handleForkClick}
        />
      </div>
      <div className="meta">
        <span>{formatRelative(session.created_at, now)}</span>
      </div>
    </div>
  );
}
