import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../state/store.js";
import {
  makeOriginId,
  messageMatchesScope,
  openFileTreeChannel,
  type FileTreeChannel,
} from "../state/fileTreeBroadcast.js";

/* Standalone /file-tree tab-state sync (X6). Mounted ONLY by FileTreePage.

   Broadcasts this tab's (path_id, sessionId) + active file + diff mode so a
   sibling standalone tab on the same (path_id, sessionId) follows along, and
   applies matching inbound messages to THIS tab's per-tab store. It never
   touches the kernel's active project/session (see fileTreeBroadcast.ts).

   Mechanics:
     • Subscribe to the active file (per current session) and its diff mode.
     • POST a coherence message whenever either changes locally.
     • On INBOUND messages, open/activate the file + set its diff mode, but
       only when (path_id, sessionId) matches and the value actually differs
       (so the inbound apply does not re-trigger an identical outbound post). */
export function useFileTreeBroadcast(): void {
  const origin = useMemo(makeOriginId, []);
  const channelRef = useRef<FileTreeChannel | null>(null);

  const activePathId = useStore((s) => s.activePathId);
  const sessionId = useStore((s) => s.currentSessionId);
  const activeFile = useStore((s) =>
    s.currentSessionId !== null
      ? (s.fileViewerActiveBySession[s.currentSessionId] ?? null)
      : null,
  );
  const diffMode = useStore((s) => {
    const sid = s.currentSessionId;
    if (sid === null) return undefined;
    const key = s.fileViewerActiveBySession[sid] ?? null;
    if (key === null) return undefined;
    return s.fileViewerDiffBySession[sid]?.[key]?.mode;
  });

  const openFile = useStore((s) => s.openFile);
  const setFileViewerActive = useStore((s) => s.setFileViewerActive);
  const setFileViewerDiff = useStore((s) => s.setFileViewerDiff);

  /* Guard so applying an INBOUND message doesn't echo straight back out: the
     outbound effect compares against this last-applied signature. */
  const suppressRef = useRef<string | null>(null);

  /* Open the channel once; the receiver reads live store state via getState so
     a session switch never forces a reconnect. */
  useEffect(() => {
    const channel = openFileTreeChannel(origin, (msg) => {
      const s = useStore.getState();
      const sid = s.currentSessionId;
      if (
        !messageMatchesScope(msg, origin, s.activePathId, sid) ||
        sid === null
      ) {
        return;
      }
      const localActive = s.fileViewerActiveBySession[sid] ?? null;
      /* Apply active-file change. openFile both adds+activates; for a clear we
         set active to null. Suppress the resulting outbound echo. */
      if (msg.activeFile !== localActive) {
        suppressRef.current = signature(msg.activeFile, msg.diffMode);
        if (msg.activeFile === null) setFileViewerActive(null);
        else openFile(msg.activeFile);
      }
      /* Apply diff mode for the (now) active file when it differs. */
      if (msg.activeFile !== null && msg.diffMode !== undefined) {
        const cur = s.fileViewerDiffBySession[sid]?.[msg.activeFile]?.mode;
        if (cur !== msg.diffMode) {
          suppressRef.current = signature(msg.activeFile, msg.diffMode);
          setFileViewerDiff(msg.activeFile, { mode: msg.diffMode });
        }
      }
    });
    channelRef.current = channel;
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [origin, openFile, setFileViewerActive, setFileViewerDiff]);

  /* Broadcast local selection/diff changes. */
  useEffect(() => {
    if (sessionId === null) return;
    const sig = signature(activeFile, diffMode);
    if (suppressRef.current === sig) {
      suppressRef.current = null;
      return;
    }
    channelRef.current?.post({
      pathId: activePathId,
      sessionId,
      activeFile,
      ...(diffMode !== undefined ? { diffMode } : {}),
    });
  }, [activePathId, sessionId, activeFile, diffMode]);
}

/* Stable signature for echo suppression. */
function signature(
  activeFile: string | null,
  diffMode: string | undefined,
): string {
  return `${activeFile ?? ""}::${diffMode ?? ""}`;
}
