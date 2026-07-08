import { afterEach, describe, expect, it } from "vitest";
import {
  fileTreeNamespace,
  getStorageNamespace,
  nsKey,
  setStorageNamespace,
} from "../../src/state/storageNamespace.js";

/* X6 / review finding 3: the standalone /file-tree namespace must isolate
   persisted keys AND fold in the launch path_id so equal session ids across
   roots cannot collide. The namespace also lives in its own module so the
   bootstrap can set it BEFORE the shared store is evaluated. */

afterEach(() => {
  setStorageNamespace("");
});

describe("storage namespace", () => {
  it("defaults to the empty (main-app) namespace", () => {
    expect(getStorageNamespace()).toBe("");
    expect(nsKey("fileViewerTabsBySession")).toBe("fileViewerTabsBySession");
  });

  it("prefixes keys once a namespace is set", () => {
    setStorageNamespace("fmark.fileTreePage.v1");
    expect(nsKey("fileViewerTabsBySession")).toBe(
      "fmark.fileTreePage.v1.fileViewerTabsBySession",
    );
  });

  it("folds path_id into the file-tree namespace so cross-root ids don't collide", () => {
    const a = fileTreeNamespace("aaaaaaaaaaaa");
    const b = fileTreeNamespace("bbbbbbbbbbbb");
    expect(a).toBe("fmark.fileTreePage.v1.aaaaaaaaaaaa");
    expect(b).toBe("fmark.fileTreePage.v1.bbbbbbbbbbbb");
    expect(a).not.toBe(b);

    setStorageNamespace(a);
    const keyUnderA = nsKey("fileViewerTabsBySession");
    setStorageNamespace(b);
    const keyUnderB = nsKey("fileViewerTabsBySession");
    /* Same store key, two roots → two distinct localStorage keys. */
    expect(keyUnderA).not.toBe(keyUnderB);
  });

  it("uses an isolated (not bare/shared) namespace when path_id is missing", () => {
    /* A bare prefix would be shared by every path_id-less root, reintroducing
       the cross-root collision; the _nopath sub-namespace keeps it isolated. */
    expect(fileTreeNamespace(null)).toBe("fmark.fileTreePage.v1._nopath");
    expect(fileTreeNamespace(undefined)).toBe("fmark.fileTreePage.v1._nopath");
    expect(fileTreeNamespace("")).toBe("fmark.fileTreePage.v1._nopath");
    /* …and a real path_id still gets its own distinct namespace. */
    expect(fileTreeNamespace("aaaaaaaaaaaa")).not.toBe(
      fileTreeNamespace(null),
    );
  });
});
