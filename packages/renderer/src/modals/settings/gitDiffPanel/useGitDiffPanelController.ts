import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { GitDiffSettingsResponse } from "@f-mark/shared";

import type { RootScope } from "../../../api/rootScope.js";
import { pingGitDiffSettings } from "../../../state/gitDiffSettingsSync.js";
import {
  gitDiffCacheEntry,
  hasSavedOverride,
  isDirtyOverride,
  isNotGitStatus,
  overrideInputValue,
  validationMessage,
  type GitDiffPanelMessage,
} from "./model.js";
import { useGitDiffPanelEnvironment } from "./useGitDiffPanelEnvironment.js";

const NO_LOOSE_STRING_VALUES = {
  err: "err",
  ok: "ok",
  saved: "Saved.",
  branch: "branch",
} as const;

export interface GitDiffPanelController {
  activePath: string | null;
  busy: boolean;
  clearOverride: () => Promise<void>;
  dirty: boolean;
  hasSavedOverride: boolean;
  isNotGit: boolean;
  message: GitDiffPanelMessage | null;
  override: string;
  saveOverride: () => Promise<void>;
  scope: RootScope | null;
  setOverride: Dispatch<SetStateAction<string>>;
  settings: GitDiffSettingsResponse | null;
  trimmedOverride: string;
  validateOverride: () => Promise<void>;
}

export function useGitDiffPanelController(): GitDiffPanelController {
  const { activePath, client, scope, setGitDiffSettings } =
    useGitDiffPanelEnvironment();

  const [settings, setSettings] = useState<GitDiffSettingsResponse | null>(null);
  const [override, setOverride] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<GitDiffPanelMessage | null>(null);

  const applySettings = useCallback(
    (next: GitDiffSettingsResponse) => {
      setSettings(next);
      setOverride(overrideInputValue(next));
      setGitDiffSettings(next.path_id, gitDiffCacheEntry(next));
    },
    [setGitDiffSettings],
  );

  const refresh = useCallback(async () => {
    if (scope === null) return;
    applySettings(await client.gitDiffSettings(scope));
  }, [applySettings, client, scope]);

  useEffect(() => {
    void refresh().catch(() =>
      setMessage({ kind: NO_LOOSE_STRING_VALUES.err, text: "failed to load settings" }),
    );
  }, [refresh]);

  const save = useCallback(
    async (value: string | null) => {
      if (settings === null) return;
      setBusy(true);
      setMessage(null);
      try {
        const res = await client.putGitDiffSettings({
          pathId: settings.path_id,
          diffBaseRefOverride: value,
        });
        applySettings(res);
        /* X6: nudge every other open tab (main + standalone /file-tree) to
           re-fetch this project's base-ref settings, since it is a shared
           project setting with no per-setting WS event. */
        pingGitDiffSettings(res.path_id);
        setMessage({
          kind: NO_LOOSE_STRING_VALUES.ok,
          text: value === null ? "Override cleared." : NO_LOOSE_STRING_VALUES.saved,
        });
      } catch (err) {
        setMessage({
          kind: NO_LOOSE_STRING_VALUES.err,
          text: err instanceof Error ? err.message : "save failed",
        });
      } finally {
        setBusy(false);
      }
    },
    [applySettings, client, settings],
  );

  const trimmedOverride = override.trim();
  const validateOverride = useCallback(async () => {
    if (scope === null) return;
    setMessage(null);
    setBusy(true);
    try {
      /* Real validation: resolveBase validates an explicit preview ref and
         reports base-not-found for an unknown one. */
      const res = await client.gitChangedFiles({
        scope,
        mode: NO_LOOSE_STRING_VALUES.branch,
        base: trimmedOverride,
      });
      setMessage(validationMessage(res));
    } catch {
      setMessage({ kind: NO_LOOSE_STRING_VALUES.err, text: "validation failed" });
    } finally {
      setBusy(false);
    }
  }, [client, scope, trimmedOverride]);

  const saveOverride = useCallback(
    () => save(trimmedOverride.length > 0 ? trimmedOverride : null),
    [save, trimmedOverride],
  );
  const clearOverride = useCallback(() => save(null), [save]);

  return {
    activePath,
    busy,
    clearOverride,
    dirty: isDirtyOverride(settings, override),
    hasSavedOverride: hasSavedOverride(settings),
    isNotGit: isNotGitStatus(settings),
    message,
    override,
    saveOverride,
    scope,
    setOverride,
    settings,
    trimmedOverride,
    validateOverride,
  };
}
