const NO_LOOSE_STRING_VALUES = {
  branch: "branch",
} as const;

/* Fetch the changed-files set for a known root and populate the store's
   per-file badge map (design §8.3). Whole-branch mode so the FileRow badge
   reflects every change since the merge-base, independent of the per-tab diff
   mode. Re-fetched (not patched) on the files.changed WS event. */

import type { Client } from "../../../api/client.js";
import type { RootScope } from "../../../api/rootScope.js";
import type { GitFileStatus } from "@f-mark/shared";
import { useStore } from "../../../state/store.js";

const inFlight = new Map<string, Promise<void>>();

export function loadGitChangedFiles(
  client: Pick<Client, "gitChangedFiles">,
  scope: RootScope,
): Promise<void> {
  const pathId = "pathId" in scope ? scope.pathId : scope.root;
  const existing = inFlight.get(pathId);
  if (existing !== undefined) return existing;

  const request = client
    .gitChangedFiles({ scope, mode: NO_LOOSE_STRING_VALUES.branch })
    .then((res) => {
      const byRel: Record<string, GitFileStatus> = {};
      /* Rename pairing (old_path → new_path) so an absent renamed OLD path can
         be opened/diffed against the present NEW working path (round-2 #6). */
      const renames: Record<string, string> = {};
      for (const f of res.files) {
        byRel[f.rel_path] = f.status;
        if (f.old_path !== undefined) {
          byRel[f.old_path] = f.status;
          if (f.old_path !== f.rel_path) renames[f.old_path] = f.rel_path;
        }
      }
      /* Key by the REQUESTED scope's canonical path_id (from the response) —
         NOT activePathId, which can belong to a different root in a standalone
         /file-tree tab (review §7). Falls back to the scope's pathId, then the
         raw key, so a request by raw root still lands somewhere keyable. */
      const resolvedId =
        res.path_id.length > 0
          ? res.path_id
          : "pathId" in scope
            ? scope.pathId
            : pathId;
      useStore.getState().setGitChangedFiles(resolvedId, byRel, renames);
    })
    .catch(() => {
      /* leave the badge map untouched on failure */
    })
    .finally(() => {
      inFlight.delete(pathId);
    });

  inFlight.set(pathId, request);
  return request;
}
