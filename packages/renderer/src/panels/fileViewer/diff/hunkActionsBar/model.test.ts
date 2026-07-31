import { describe, it, expect } from "vitest";
import type { GitFileStatus } from "@f-mark/shared";
import { fileActionLabel, hunkActionLabel, revertConfirmDetail } from "./model";

const GENERIC_DETAIL = "Discards your uncommitted changes to this file.";

/** One row per `GitFileStatus` member (packages/shared/src/git.ts:28-38) —
    all ten, so a regression that drops a status from any branch fails here
    instead of shipping silently. */
const STATUS_TABLE: Array<{
  status: GitFileStatus;
  hunkLabel: string;
  fileLabel: string;
  detailKind: "generic" | "permanent" | "recoverable-by-plumbing";
}> = [
  { status: "added", hunkLabel: "Delete hunk", fileLabel: "Delete file", detailKind: "recoverable-by-plumbing" },
  { status: "modified", hunkLabel: "Revert hunk", fileLabel: "Restore file", detailKind: "generic" },
  { status: "deleted", hunkLabel: "Restore hunk", fileLabel: "Restore file", detailKind: "generic" },
  { status: "renamed", hunkLabel: "Revert hunk", fileLabel: "Restore file", detailKind: "generic" },
  { status: "untracked", hunkLabel: "Delete hunk", fileLabel: "Delete file", detailKind: "permanent" },
  { status: "binary-added", hunkLabel: "Delete hunk", fileLabel: "Delete file", detailKind: "recoverable-by-plumbing" },
  { status: "binary-modified", hunkLabel: "Revert hunk", fileLabel: "Restore file", detailKind: "generic" },
  { status: "binary-deleted", hunkLabel: "Restore hunk", fileLabel: "Restore file", detailKind: "generic" },
  { status: "binary-renamed", hunkLabel: "Revert hunk", fileLabel: "Restore file", detailKind: "generic" },
  { status: "binary-untracked", hunkLabel: "Delete hunk", fileLabel: "Delete file", detailKind: "permanent" },
];

describe("hunkActionLabel", () => {
  it.each(STATUS_TABLE)("labels $status as $hunkLabel", ({ status, hunkLabel }) => {
    expect(hunkActionLabel(status)).toBe(hunkLabel);
  });
});

describe("fileActionLabel", () => {
  it.each(STATUS_TABLE)("labels $status as $fileLabel", ({ status, fileLabel }) => {
    expect(fileActionLabel(status)).toBe(fileLabel);
  });
});

describe("revertConfirmDetail", () => {
  it.each(STATUS_TABLE)("gives a $detailKind detail for $status", ({ status, detailKind }) => {
    const detail = revertConfirmDetail(status);
    if (detailKind === "permanent") {
      expect(detail).toContain("permanent");
    } else if (detailKind === "recoverable-by-plumbing") {
      expect(detail).not.toBe(GENERIC_DETAIL);
      expect(detail).not.toContain("permanent");
    } else {
      expect(detail).toBe(GENERIC_DETAIL);
    }
  });

  // Pins the invariant behind the Blocker this task closes: a status whose
  // label says "Delete" must never get the same reassurance as a fully
  // reversible revert. This single check alone would have caught the
  // under-warning bug in `added`/`binary-added`.
  it.each(STATUS_TABLE)(
    "never pairs a Delete label with the generic discard detail ($status)",
    ({ status, hunkLabel, fileLabel }) => {
      const isDelete = hunkLabel === "Delete hunk" || fileLabel === "Delete file";
      if (isDelete) {
        expect(revertConfirmDetail(status)).not.toBe(GENERIC_DETAIL);
      }
    },
  );
});
