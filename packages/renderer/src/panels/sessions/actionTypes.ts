import type { Dispatch, SetStateAction } from "react";
import type { SessionMeta } from "../../api/client.js";

export type SetCurrentSession = (
  id: string | null,
  root?: { path?: string; path_id?: string } | null,
) => void;

export interface SessionActionBaseInput {
  activePath: string | null;
  closeContextMenu: () => void;
  currentSessionId: string | null;
  refreshSelectedRootSessions: (session: SessionMeta | null) => Promise<void>;
  setAllSessions: Dispatch<SetStateAction<SessionMeta[]>>;
  setCurrentSession: SetCurrentSession;
  setError: (error: string | null) => void;
  token: string | null;
}
