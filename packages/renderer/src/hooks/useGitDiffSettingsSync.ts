import { useEffect } from "react";
import { createClient } from "../api/client.js";
import type { RootScope } from "../api/rootScope.js";
import { useStore } from "../state/store.js";
import { subscribeGitDiffSettingsPing } from "../state/gitDiffSettingsSync.js";

/* Refresh the renderer's cached git/diff base-ref settings when ANOTHER tab
   saves a new override (X6 cross-tab base-ref sync). Mounted once in App and
   once in FileTreePage. Derives the active scope from the store's
   activePathId/activePath (in the main app this is the active project; in the
   standalone /file-tree it is the seeded selected root) and only re-fetches
   when the pinged path_id matches OR the saved path_id is unknown (best effort
   — a path_id mismatch for a different project is ignored, since this tab's
   cache for that project, if any, will refresh when it next becomes active). */
export function useGitDiffSettingsSync(): void {
  const token = useStore((s) => s.token);
  const activePath = useStore((s) => s.activePath);
  const activePathId = useStore((s) => s.activePathId);
  const setGitDiffSettings = useStore((s) => s.setGitDiffSettings);

  useEffect(() => {
    return subscribeGitDiffSettingsPing((pingedPathId) => {
      /* Only refresh when the ping is for THIS tab's active project (or the
         saver couldn't report a path_id). Prevents a save in project B from
         firing a wasted fetch in a tab showing project A. */
      if (
        pingedPathId !== null &&
        activePathId !== null &&
        pingedPathId !== activePathId
      ) {
        return;
      }
      const scope: RootScope | null =
        activePathId !== null
          ? { pathId: activePathId }
          : activePath !== null
            ? { root: activePath }
            : null;
      if (scope === null) return;
      const client = createClient({ baseUrl: "", token });
      void client
        .gitDiffSettings(scope)
        .then((res) => {
          setGitDiffSettings(res.path_id, {
            baseRefOverride: res.diff_base_ref_override,
            detectedBaseRef: res.detected_base_ref,
            effectiveBaseRef: res.effective_base_ref,
            mergeBaseSha: res.merge_base_sha,
            status: res.status,
          });
        })
        .catch(() => {
          /* leave the cache untouched on failure */
        });
    });
  }, [token, activePath, activePathId, setGitDiffSettings]);
}
