import { useEffect } from "react";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";
import { useFileScope } from "../fileScope.js";

const NO_LOOSE_STRING_VALUES = {
  notGit: "not-git",
} as const;

export function useGitDiffAvailability(): boolean {
  const { scope } = useFileScope();
  const token = useStore((s) => s.token);
  const setGitDiffSettings = useStore((s) => s.setGitDiffSettings);
  const scopePathId = scope !== null && "pathId" in scope ? scope.pathId : null;
  const notGit = useStore((s) =>
    scopePathId !== null
      ? s.gitDiffSettingsByPathId[scopePathId]?.status === NO_LOOSE_STRING_VALUES.notGit
      : false,
  );

  /* Prime the git/diff settings cache for the active scope so the toggle can
     disable on non-git roots and the gear/settings panel have data. */
  useEffect(() => {
    if (scope === null) return;
    let cancelled = false;
    const client = createClient({ baseUrl: "", token });
    client
      .gitDiffSettings(scope)
      .then((res) => {
        if (cancelled) return;
        setGitDiffSettings(res.path_id, {
          baseRefOverride: res.diff_base_ref_override,
          detectedBaseRef: res.detected_base_ref,
          effectiveBaseRef: res.effective_base_ref,
          mergeBaseSha: res.merge_base_sha,
          status: res.status,
        });
      })
      .catch(() => {
        /* leave cache untouched on failure */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(scope ?? null), token]);

  return notGit;
}
