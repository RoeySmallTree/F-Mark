import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../../src/state/store.js";
import {
  fileTreeNamespace,
  setStorageNamespace,
} from "../../src/state/storageNamespace.js";

/* review-phase2-round2 Blocker 3 / New issue #1: the standalone /file-tree
   namespace must fold in the CURRENTLY-SELECTED path_id and re-hydrate the
   per-session store slices when the dropdown switches to a session under a
   different root, so equal session ids across roots never collide. The
   approach chosen is re-hydrate (rehydrateNamespacedSlices) rather than
   in-memory-only, so each root's file-viewer tabs/active persist independently
   and are restored on return. */

const SID = "s1"; // same session id under two roots — the collision case

afterEach(() => {
  setStorageNamespace("");
  globalThis.localStorage.clear();
  /* Reset the in-memory slices so one test's tabs don't leak into the next. */
  setStorageNamespace("");
  useStore.getState().rehydrateNamespacedSlices();
});

beforeEach(() => {
  globalThis.localStorage.clear();
});

function enterRoot(pathId: string): void {
  setStorageNamespace(fileTreeNamespace(pathId));
  useStore.getState().rehydrateNamespacedSlices();
}

describe("standalone /file-tree namespace keying + re-hydrate", () => {
  it("isolates equal session ids across roots and restores on return", () => {
    const store = useStore.getState();

    /* Root A: select the session, open a file. */
    enterRoot("aaaaaaaaaaaa");
    store.setCurrentSession(SID);
    store.openFile("/root/a/file-a.ts");
    expect(useStore.getState().fileViewerTabsBySession[SID]).toEqual([
      { path: "/root/a/file-a.ts", pinned: false },
    ]);

    /* Switch to Root B (same session id). After re-keying + re-hydrate the
       tab map for SID must be EMPTY — root A's tab must not be visible. */
    enterRoot("bbbbbbbbbbbb");
    expect(useStore.getState().fileViewerTabsBySession[SID]).toBeUndefined();

    /* Open a different file under root B's session. */
    store.openFile("/root/b/file-b.ts");
    expect(useStore.getState().fileViewerTabsBySession[SID]).toEqual([
      { path: "/root/b/file-b.ts", pinned: false },
    ]);

    /* Return to Root A — its tab is restored from localStorage, unaffected
       by root B's writes. */
    enterRoot("aaaaaaaaaaaa");
    expect(useStore.getState().fileViewerTabsBySession[SID]).toEqual([
      { path: "/root/a/file-a.ts", pinned: false },
    ]);

    /* And the two roots wrote to genuinely distinct localStorage keys. */
    const keyA = "fmark.fileTreePage.v1.aaaaaaaaaaaa.fmark.fileViewer.tabsBySession";
    const keyB = "fmark.fileTreePage.v1.bbbbbbbbbbbb.fmark.fileViewer.tabsBySession";
    expect(globalThis.localStorage.getItem(keyA)).not.toBeNull();
    expect(globalThis.localStorage.getItem(keyB)).not.toBeNull();
    expect(globalThis.localStorage.getItem(keyA)).not.toBe(
      globalThis.localStorage.getItem(keyB),
    );
  });

  it("uses an isolated namespace even when path_id is absent", () => {
    enterRoot("aaaaaaaaaaaa");
    useStore.getState().setCurrentSession(SID);
    useStore.getState().openFile("/root/a/x.ts");

    /* A path_id-less launch must NOT share root A's bucket. */
    setStorageNamespace(fileTreeNamespace(null));
    useStore.getState().rehydrateNamespacedSlices();
    expect(
      useStore.getState().fileViewerTabsBySession[SID],
    ).toBeUndefined();
  });
});
