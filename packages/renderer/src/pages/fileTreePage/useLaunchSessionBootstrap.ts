import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { SessionMeta } from "@f-mark/shared";
import type { Client } from "../../api/client.js";
import { resolveSession, type LaunchParams } from "./session.js";
import type { FileTreeStatus } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  error: "error",
  ready: "ready",
} as const;

interface LaunchSessionBootstrapInput {
  launch: LaunchParams;
  client: Client;
  setAllSessions: Dispatch<SetStateAction<SessionMeta[]>>;
  setStatus: Dispatch<SetStateAction<FileTreeStatus>>;
  applySessionNamespace(session: SessionMeta): void;
  seedResolvedSession(session: SessionMeta): void;
}

export function useLaunchSessionBootstrap({
  launch,
  client,
  setAllSessions,
  setStatus,
  applySessionNamespace,
  seedResolvedSession,
}: LaunchSessionBootstrapInput): void {
  useEffect(() => {
    if (launch.sessionId === null) {
      setStatus({
        kind: NO_LOOSE_STRING_VALUES.error,
        message: "no sessionId in /file-tree/:sessionId URL",
      });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const all = await client.listAllSessions();
        if (cancelled) return;
        setAllSessions(all);
        const resolved = resolveSession(all, launch.sessionId!, launch.pathId);
        if (!resolved.ok) {
          setStatus({ kind: NO_LOOSE_STRING_VALUES.error, message: resolved.reason });
          return;
        }
        applySessionNamespace(resolved.session);
        seedResolvedSession(resolved.session);
        setStatus({ kind: NO_LOOSE_STRING_VALUES.ready });
      } catch (err) {
        if (cancelled) return;
        setStatus({
          kind: NO_LOOSE_STRING_VALUES.error,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    applySessionNamespace,
    client,
    launch.pathId,
    launch.sessionId,
    seedResolvedSession,
    setAllSessions,
    setStatus,
  ]);
}
