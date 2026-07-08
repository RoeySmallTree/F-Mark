import { useState, type Dispatch, type SetStateAction } from "react";
import type { SessionMeta } from "@f-mark/shared";
import type { FileTreeStatus } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  loading: "loading",
} as const;

export interface LaunchSessionState {
  allSessions: SessionMeta[];
  status: FileTreeStatus;
  setAllSessions: Dispatch<SetStateAction<SessionMeta[]>>;
  setStatus: Dispatch<SetStateAction<FileTreeStatus>>;
}

export function useLaunchSessionState(): LaunchSessionState {
  const [allSessions, setAllSessions] = useState<SessionMeta[]>([]);
  const [status, setStatus] = useState<FileTreeStatus>({ kind: NO_LOOSE_STRING_VALUES.loading });

  return { allSessions, status, setAllSessions, setStatus };
}
