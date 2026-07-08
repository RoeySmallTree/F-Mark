/* loadGitChangedFiles keys the badge map by the RESPONSE path_id, not by the
   active path_id (review §7). A standalone /file-tree tab for a non-active root
   must store badges under its own root's path_id. */

import { afterEach, describe, it, expect } from "vitest";
import { loadGitChangedFiles } from "../../src/panels/right/files/loadGitChangedFiles.js";
import { useStore } from "../../src/state/store.js";
import { actionsForStatus, type GitChangedFilesResponse } from "@f-mark/shared";

afterEach(() => {
  useStore.setState({
    gitChangedByPathId: {},
    gitRenamesByPathId: {},
    activePathId: null,
  });
});

function fakeClient(res: GitChangedFilesResponse): {
  gitChangedFiles: () => Promise<GitChangedFilesResponse>;
} {
  return { gitChangedFiles: () => Promise.resolve(res) };
}

describe("loadGitChangedFiles", () => {
  it("keys badges under the response path_id, not activePathId", async () => {
    /* The active tab is a DIFFERENT root than the one we request. */
    useStore.setState({ activePathId: "active-root-id" });
    const res: GitChangedFilesResponse = {
      status: "ok",
      path_id: "requested-root-id",
      base_ref: "main",
      merge_base_sha: "abc",
      files: [
        { rel_path: "a.ts", status: "modified", additions: 1, deletions: 0, binary: false, actions: actionsForStatus("modified") },
        {
          rel_path: "new.ts",
          old_path: "old.ts",
          status: "renamed",
          additions: 0,
          deletions: 0,
          binary: false,
          actions: actionsForStatus("renamed"),
        },
      ],
    };
    await loadGitChangedFiles(fakeClient(res) as never, { pathId: "requested-root-id" });

    const map = useStore.getState().gitChangedByPathId;
    /* Stored under the REQUESTED root's id... */
    expect(map["requested-root-id"]?.["a.ts"]).toBe("modified");
    /* ...with both rename paths keyed... */
    expect(map["requested-root-id"]?.["new.ts"]).toBe("renamed");
    expect(map["requested-root-id"]?.["old.ts"]).toBe("renamed");
    /* ...and NOT under the active root's id. */
    expect(map["active-root-id"]).toBeUndefined();

    /* The rename pairing (old → new) is stored so an absent renamed OLD path
       can be opened against its present NEW working path (round-2 #6). */
    const renames = useStore.getState().gitRenamesByPathId;
    expect(renames["requested-root-id"]?.["old.ts"]).toBe("new.ts");
    /* A non-renamed modified file is not in the rename map. */
    expect(renames["requested-root-id"]?.["a.ts"]).toBeUndefined();
  });
});
