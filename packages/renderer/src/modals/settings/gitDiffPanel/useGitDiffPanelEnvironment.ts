import { useMemo } from "react";

import { createClient, type Client } from "../../../api/client.js";
import type { RootScope } from "../../../api/rootScope.js";
import type { GitDiffSettingsCacheEntry } from "../../../state/fileViewerPersistence.js";
import { useStore } from "../../../state/store.js";
import { resolveGitDiffScope } from "./model.js";

type SetGitDiffSettings = (
  pathId: string,
  entry: GitDiffSettingsCacheEntry,
) => void;

export interface GitDiffPanelEnvironment {
  activePath: string | null;
  client: Client;
  scope: RootScope | null;
  setGitDiffSettings: SetGitDiffSettings;
}

export function useGitDiffPanelEnvironment(): GitDiffPanelEnvironment {
  const token = useStore((s) => s.token);
  const activePath = useStore((s) => s.activePath);
  const activePathId = useStore((s) => s.activePathId);
  const setGitDiffSettings = useStore((s) => s.setGitDiffSettings);
  const client = useMemo(() => createClient({ baseUrl: "", token }), [token]);
  const scope = useMemo(
    () => resolveGitDiffScope(activePathId, activePath),
    [activePathId, activePath],
  );

  return { activePath, client, scope, setGitDiffSettings };
}
