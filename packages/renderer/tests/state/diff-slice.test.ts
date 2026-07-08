/* Per-tab diff store slice (design §8.3). The diff mode/style is keyed by
   (sessionId → absPath), defaults to current-session + side-by-side, and is
   NOT persisted to localStorage (resets on reload). */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useStore,
  DEFAULT_FILE_VIEWER_DIFF,
} from "../../src/state/store.js";

function reset(): void {
  useStore.setState({
    currentSessionId: "s1",
    fileViewerDiffBySession: {},
    gitDiffSettingsByPathId: {},
    gitChangedByPathId: {},
  });
}

describe("fileViewerDiffBySession slice", () => {
  beforeEach(reset);

  it("defaults to current-session + side-by-side", () => {
    expect(DEFAULT_FILE_VIEWER_DIFF).toEqual({
      mode: "current-session",
      style: "side-by-side",
      baseRef: null,
    });
  });

  it("setFileViewerDiff sets mode for the current session/path", () => {
    useStore.getState().setFileViewerDiff("/root/a.ts", { mode: "whole-branch" });
    const entry = useStore.getState().fileViewerDiffBySession["s1"]?.["/root/a.ts"];
    expect(entry).toEqual({
      mode: "whole-branch",
      style: "side-by-side",
      baseRef: null,
    });
  });

  it("patches style without clobbering mode", () => {
    const set = useStore.getState().setFileViewerDiff;
    set("/root/a.ts", { mode: "whole-branch" });
    set("/root/a.ts", { style: "inline" });
    const entry = useStore.getState().fileViewerDiffBySession["s1"]?.["/root/a.ts"];
    expect(entry).toEqual({
      mode: "whole-branch",
      style: "inline",
      baseRef: null,
    });
  });

  it("patches compare base without clobbering mode or style", () => {
    const set = useStore.getState().setFileViewerDiff;
    set("/root/a.ts", { mode: "whole-branch", style: "inline" });
    set("/root/a.ts", { baseRef: "feature" });
    const entry = useStore.getState().fileViewerDiffBySession["s1"]?.["/root/a.ts"];
    expect(entry).toEqual({
      mode: "whole-branch",
      style: "inline",
      baseRef: "feature",
    });
  });

  it("keeps separate state per path within a session", () => {
    const set = useStore.getState().setFileViewerDiff;
    set("/root/a.ts", { mode: "none" });
    set("/root/b.ts", { mode: "whole-branch" });
    const byPath = useStore.getState().fileViewerDiffBySession["s1"];
    expect(byPath?.["/root/a.ts"]?.mode).toBe("none");
    expect(byPath?.["/root/b.ts"]?.mode).toBe("whole-branch");
  });

  it("supports an explicit session namespace (standalone tab)", () => {
    useStore
      .getState()
      .setFileViewerDiff("/root/a.ts", { mode: "none" }, "__standalone__");
    expect(
      useStore.getState().fileViewerDiffBySession["__standalone__"]?.["/root/a.ts"]
        ?.mode,
    ).toBe("none");
    /* current-session namespace untouched */
    expect(useStore.getState().fileViewerDiffBySession["s1"]).toBeUndefined();
  });

  it("is a no-op with no session and no key", () => {
    useStore.setState({ currentSessionId: null });
    useStore.getState().setFileViewerDiff("/root/a.ts", { mode: "none" });
    expect(useStore.getState().fileViewerDiffBySession).toEqual({});
  });
});

describe("gitDiffSettingsByPathId + gitChangedByPathId slices", () => {
  beforeEach(reset);

  it("caches git/diff settings by path_id", () => {
    useStore.getState().setGitDiffSettings("pid1", {
      baseRefOverride: null,
      detectedBaseRef: "main",
      effectiveBaseRef: "main",
      mergeBaseSha: "abc",
      status: "ok",
    });
    expect(useStore.getState().gitDiffSettingsByPathId["pid1"]?.status).toBe("ok");
  });

  it("stores per-file changed status by path_id", () => {
    useStore.getState().setGitChangedFiles("pid1", {
      "src/a.ts": "modified",
      "new.ts": "added",
    });
    expect(useStore.getState().gitChangedByPathId["pid1"]?.["new.ts"]).toBe("added");
  });
});
