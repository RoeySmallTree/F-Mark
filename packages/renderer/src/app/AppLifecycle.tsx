import { useEffect, useMemo } from "react";
import { useFileCommentReveal } from "../panels/fileViewer/lineComment/useFileCommentReveal.js";
import { useGitDiffSettingsSync } from "../hooks/useGitDiffSettingsSync.js";
import { useStore } from "../state/store.js";
import { useAppBootstrap } from "./useAppBootstrap.js";
import { useAppWebSocket } from "./useAppWebSocket.js";
import { useManagedAgentFocusEnsure } from "./useManagedAgentFocusEnsure.js";
import { useSessionEvents } from "./useSessionEvents.js";

function readTokenFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

function useTokenFromQuery(): string | null {
  const setToken = useStore((s) => s.setToken);
  const queryToken = useMemo(() => readTokenFromQuery(), []);

  useEffect(() => {
    setToken(queryToken);
  }, [queryToken, setToken]);

  return queryToken;
}

export function AppLifecycle(input: {
  setDevKernelRestartEnabled(enabled: boolean): void;
}): null {
  const storedToken = useStore((s) => s.token);
  const queryToken = useTokenFromQuery();
  const token = queryToken ?? storedToken;

  useAppBootstrap({
    token,
    setDevKernelRestartEnabled: input.setDevKernelRestartEnabled,
  });
  useSessionEvents(token);
  useManagedAgentFocusEnsure(token);
  useAppWebSocket(token);

  /* The file-comment reveal bridge must be always mounted
     (not inside FileViewer), so a reveal can re-surface a collapsed/dismissed/
     lower viewer. Mounted once here in App (and once in FileTreePage). */
  useFileCommentReveal();

  /* X6 cross-tab base-ref sync — re-fetch this project's git/diff settings when
     another tab saves a new override (storage-event driven). */
  useGitDiffSettingsSync();

  return null;
}
