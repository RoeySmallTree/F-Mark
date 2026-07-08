import { useEffect, useMemo, useState } from "react";
import { PLACEHOLDER_SESSION_SLUG } from "@f-mark/shared";
import { createClient } from "../../api/client.js";
import { useStore } from "../../state/store.js";
import { recentPresetPaths } from "./pathLabels.js";
import type { NewSessionController } from "./types.js";

export function useNewSessionController(): NewSessionController {
  const token = useStore((state) => state.token);
  const setSessions = useStore((state) => state.setSessions);
  const setCurrentSession = useStore((state) => state.setCurrentSession);
  const setParticipants = useStore((state) => state.setParticipants);
  const setPathsState = useStore((state) => state.setPathsState);
  const activePath = useStore((state) => state.activePath);
  const knownPaths = useStore((state) => state.knownPaths) ?? [];
  const favorites = useStore((state) => state.favorites) ?? [];
  const closeModal = useStore((state) => state.closeModal);
  const [folder, setFolder] = useState<string | null>(activePath);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useMemo(() => createClient({ baseUrl: "", token }), [token]);
  const favoritePaths = useMemo(
    () => new Set(favorites.map((favorite) => favorite.path)),
    [favorites],
  );
  const recentPresets = useMemo(
    () => recentPresetPaths(knownPaths, favoritePaths),
    [knownPaths, favoritePaths],
  );
  const canSubmit = folder !== null && folder.length > 0 && !submitting;

  useEffect(() => {
    if (folder === null && activePath !== null) setFolder(activePath);
  }, [activePath, folder]);

  useEffect(() => {
    let cancelled = false;
    if (folder !== null) return;
    void (async () => {
      try {
        const home = await client.fsHome();
        if (!cancelled) setFolder(home.home);
      } catch {
        // leave folder null; submit will surface a clearer error
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folder, client]);

  /* Sessions open with the placeholder slug; the connected agent renames
     them via `fmark_rename_session` once the topic is known. */
  async function createSession(): Promise<void> {
    if (!canSubmit || folder === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await client.createSession({
        slug: PLACEHOLDER_SESSION_SLUG,
        path: folder,
      });
      await refreshPathState(client, setPathsState);
      setSessions(await client.listSessions());
      await refreshParticipants(client, setParticipants);
      /* Pass the session's root: creating a session does NOT change the
         server's active path, so without it the selection falls back to the
         stale active project and every scoped call (agent spawn, events)
         targets the wrong root -> "spawn 404: session not found". */
      setCurrentSession(session.id, session);
      closeModal();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to create session",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return {
    folder,
    pickerOpen,
    submitting,
    error,
    canSubmit,
    favorites,
    recentPresets,
    setFolder,
    setPickerOpen,
    closeModal,
    createSession,
  };
}

type Client = ReturnType<typeof createClient>;

async function refreshPathState(
  client: Client,
  setPathsState: (paths: Awaited<ReturnType<Client["getPaths"]>>) => void,
): Promise<void> {
  try {
    const paths = await client.getPaths();
    if (Array.isArray(paths.knownPaths) && Array.isArray(paths.favorites)) {
      setPathsState(paths);
    }
  } catch {
    // legacy kernel without /paths
  }
}

async function refreshParticipants(
  client: Client,
  setParticipants: (
    participants: Awaited<ReturnType<Client["listParticipants"]>>,
  ) => void,
): Promise<void> {
  try {
    setParticipants(await client.listParticipants());
  } catch {
    // legacy or temporarily unavailable participant route
  }
}
