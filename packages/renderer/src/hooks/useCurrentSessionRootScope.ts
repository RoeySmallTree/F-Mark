import { useMemo, useRef } from "react";
import {
  rootScopeForSession,
  rootScopeKey,
  type RootScope,
} from "../api/rootScope.js";
import { findSessionForSelection, useStore } from "../state/store.js";

export interface SessionRootScopeBinding {
  scope: RootScope | null;
  scopeKey: string;
}

function resolveSessionRootScope(input: {
  activePath: string | null;
  activePathId: string | null;
  selectedPath: string | null;
  selectedPathId: string | null;
  sessionPath: string;
  sessionPathId: string;
}): SessionRootScopeBinding {
  const session =
    input.sessionPathId.length > 0 || input.sessionPath.length > 0
      ? { path_id: input.sessionPathId || undefined, path: input.sessionPath || undefined }
      : undefined;
  const scope = rootScopeForSession(
    session,
    input.selectedPathId ?? input.activePathId,
    input.selectedPath ?? input.activePath,
  );
  return { scope, scopeKey: rootScopeKey(scope) };
}

export function useCurrentSessionRootScope(
  sessionIdOverride?: string | null,
): RootScope | null {
  return useCurrentSessionRootScopeBinding(sessionIdOverride).scope;
}

export function useCurrentSessionRootScopeBinding(
  sessionIdOverride?: string | null,
): SessionRootScopeBinding {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const selectedPathId = useStore((s) => s.selectedPathId);
  const selectedPath = useStore((s) => s.selectedPath);
  const activePathId = useStore((s) => s.activePathId);
  const activePath = useStore((s) => s.activePath);
  const sessionId = sessionIdOverride ?? currentSessionId;

  const sessionRootHint = useStore((s) => {
    const session = findSessionForSelection(
      s.sessions,
      sessionId,
      s.selectedPathId,
      s.selectedPath,
    );
    if (session === undefined) return "";
    return `${session.path_id ?? ""}\0${session.path ?? ""}`;
  });

  const computed = useMemo(() => {
    const [sessionPathId = "", sessionPath = ""] = sessionRootHint.split("\0");
    return resolveSessionRootScope({
      activePath,
      activePathId,
      selectedPath,
      selectedPathId,
      sessionPath,
      sessionPathId,
    });
  }, [
    activePath,
    activePathId,
    selectedPath,
    selectedPathId,
    sessionRootHint,
  ]);

  const stableRef = useRef(computed);
  if (stableRef.current.scopeKey !== computed.scopeKey) {
    stableRef.current = computed;
  }
  return stableRef.current;
}
