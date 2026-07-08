import type { Dispatch, MouseEvent, SetStateAction } from "react";
import type { SessionMeta } from "../../../api/client.js";
import type { SessionBadge } from "../../../lib/sessionBadge.js";

export interface SessionRowProps {
  active: boolean;
  badge: SessionBadge;
  draggingSessionId: string | null;
  dropTargetSessionId: string | null;
  now: Date;
  renameValue: string;
  renaming: boolean;
  repoKey: string;
  rowIndex: number;
  session: SessionMeta;
  switching: boolean;
  onBeginRename: (session: SessionMeta) => void;
  onCancelRename: () => void;
  onMoveSessionInRepo: (
    repoKey: string,
    fromId: string,
    toId: string,
  ) => void;
  onOpenContextMenu: (x: number, y: number, session: SessionMeta) => void;
  onOpenFork: (
    event: MouseEvent<HTMLButtonElement>,
    session: SessionMeta,
  ) => void;
  onRenameValueChange: Dispatch<SetStateAction<string>>;
  onSaveRename: (session: SessionMeta) => void | Promise<void>;
  onSelect: (session: SessionMeta) => void | Promise<void>;
  setDraggingSessionId: Dispatch<SetStateAction<string | null>>;
  setDropTargetSessionId: Dispatch<SetStateAction<string | null>>;
}
