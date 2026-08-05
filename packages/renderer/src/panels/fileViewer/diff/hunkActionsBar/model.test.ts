import { describe, it, expect } from "vitest";
import type { GitFileStatus } from "@f-mark/shared";
import {
  fileActionLabel,
  hunkActionLabel,
  revertActionLabel,
  revertConfirmDetail,
} from "./model";

const GENERIC_FILE_DETAIL = "Discards your uncommitted changes to this file.";
const GENERIC_HUNK_DETAIL = "Discards your uncommitted changes to this hunk.";

/** One row per `GitFileStatus` member (packages/shared/src/git.ts:28-38) —
    all ten, so a regression that drops a status from any branch fails here
    instead of shipping silently. */
const STATUS_TABLE: Array<{
  status: GitFileStatus;
  hunkLabel: string;
  fileLabel: string;
  detailKind: "generic" | "permanent" | "recoverable-by-plumbing" | "restore";
}> = [
  { status: "added", hunkLabel: "Delete hunk", fileLabel: "Delete file", detailKind: "recoverable-by-plumbing" },
  { status: "modified", hunkLabel: "Revert hunk", fileLabel: "Restore file", detailKind: "generic" },
  { status: "deleted", hunkLabel: "Restore hunk", fileLabel: "Restore file", detailKind: "restore" },
  { status: "renamed", hunkLabel: "Revert hunk", fileLabel: "Restore file", detailKind: "generic" },
  { status: "untracked", hunkLabel: "Delete hunk", fileLabel: "Delete file", detailKind: "permanent" },
  { status: "binary-added", hunkLabel: "Delete hunk", fileLabel: "Delete file", detailKind: "recoverable-by-plumbing" },
  { status: "binary-modified", hunkLabel: "Revert hunk", fileLabel: "Restore file", detailKind: "generic" },
  { status: "binary-deleted", hunkLabel: "Restore hunk", fileLabel: "Restore file", detailKind: "restore" },
  { status: "binary-renamed", hunkLabel: "Revert hunk", fileLabel: "Restore file", detailKind: "generic" },
  { status: "binary-untracked", hunkLabel: "Delete hunk", fileLabel: "Delete file", detailKind: "permanent" },
];

/** `hunk` is only offered for the five text statuses with real hunks
    (packages/shared/src/git.ts `actionsForStatus`) — binary statuses are
    file-only, so they are excluded here. */
const HUNK_CAPABLE_STATUSES: GitFileStatus[] = [
  "added",
  "modified",
  "deleted",
  "renamed",
  "untracked",
];

const RENAME_CAPABLE_STATUSES: GitFileStatus[] = ["renamed", "binary-renamed"];

function expectDetailKind(
  detail: string,
  kind: "generic" | "permanent" | "recoverable-by-plumbing" | "restore",
  genericText: string,
): void {
  if (kind === "permanent") {
    expect(detail).toContain("permanent");
  } else if (kind === "recoverable-by-plumbing") {
    expect(detail).not.toBe(genericText);
    expect(detail).not.toContain("permanent");
  } else if (kind === "restore") {
    expect(detail.toLowerCase()).toContain("restor");
    expect(detail).not.toBe(genericText);
    expect(detail).not.toContain("permanent");
    expect(detail).not.toContain("low-level");
  } else {
    expect(detail).toBe(genericText);
  }
}

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

describe("revertActionLabel", () => {
  it.each(STATUS_TABLE)(
    "action=hunk on $status matches hunkActionLabel ($hunkLabel)",
    ({ status, hunkLabel }) => {
      expect(revertActionLabel("hunk", status)).toBe(hunkLabel);
    },
  );

  it.each(STATUS_TABLE)(
    "action=file on $status matches fileActionLabel ($fileLabel)",
    ({ status, fileLabel }) => {
      expect(revertActionLabel("file", status)).toBe(fileLabel);
    },
  );

  it.each(RENAME_CAPABLE_STATUSES)(
    "action=rename on %s always reads 'Undo rename', matching the button text",
    (status) => {
      expect(revertActionLabel("rename", status)).toBe("Undo rename");
    },
  );
});

describe("revertConfirmDetail — action=file (whole-file loss)", () => {
  it.each(STATUS_TABLE)("gives a $detailKind detail for $status", ({ status, detailKind }) => {
    expectDetailKind(revertConfirmDetail("file", status), detailKind, GENERIC_FILE_DETAIL);
  });

  it("scopes the generic detail to the file", () => {
    expect(revertConfirmDetail("file", "modified")).toContain("this file");
  });
});

describe("revertConfirmDetail — action=hunk (scoped loss)", () => {
  it.each(STATUS_TABLE.filter((row) => HUNK_CAPABLE_STATUSES.includes(row.status)))(
    "gives a $detailKind detail for $status",
    ({ status, detailKind }) => {
      expectDetailKind(revertConfirmDetail("hunk", status), detailKind, GENERIC_HUNK_DETAIL);
    },
  );

  it("scopes the generic detail to the hunk, not the whole file", () => {
    const detail = revertConfirmDetail("hunk", "modified");
    expect(detail).toContain("hunk");
    expect(detail).not.toContain("this file");
  });

  it("keeps the file-level permanent/low-level warnings on untracked/added, since their one hunk IS the whole file", () => {
    expect(revertConfirmDetail("hunk", "untracked")).toContain("permanent");
    expect(revertConfirmDetail("hunk", "added")).toContain("low-level");
  });
});

describe("revertConfirmDetail — action=rename (nothing lost)", () => {
  it.each(RENAME_CAPABLE_STATUSES)("describes restoring the path for %s, not a discard", (status) => {
    const detail = revertConfirmDetail("rename", status);
    expect(detail.toLowerCase()).toContain("original path");
    expect(detail).not.toBe(GENERIC_FILE_DETAIL);
    expect(detail).not.toBe(GENERIC_HUNK_DETAIL);
    expect(detail).not.toContain("permanent");
  });
});

describe("revertConfirmDetail invariants", () => {
  // Pins the invariant behind the Blocker this task closes: a status whose
  // label says "Delete" must never get the same reassurance as a fully
  // reversible revert. This single check alone would have caught the
  // under-warning bug in `added`/`binary-added`.
  it.each(STATUS_TABLE)(
    "action=file never pairs a Delete label with the generic file-discard detail ($status)",
    ({ status, fileLabel }) => {
      if (fileLabel === "Delete file") {
        expect(revertConfirmDetail("file", status)).not.toBe(GENERIC_FILE_DETAIL);
      }
    },
  );

  it.each(STATUS_TABLE.filter((row) => HUNK_CAPABLE_STATUSES.includes(row.status)))(
    "action=hunk never pairs a Delete label with the generic hunk-discard detail ($status)",
    ({ status, hunkLabel }) => {
      if (hunkLabel === "Delete hunk") {
        expect(revertConfirmDetail("hunk", status)).not.toBe(GENERIC_HUNK_DETAIL);
      }
    },
  );

  // Fix 2 (should-fix): a Restore is not destructive. Its detail must not
  // read like a discard warning, for either action.
  it.each(STATUS_TABLE.filter((row) => row.detailKind === "restore"))(
    "a Restore label never reads like a discard warning ($status)",
    ({ status, hunkLabel, fileLabel }) => {
      if (fileLabel === "Restore file") {
        expect(revertConfirmDetail("file", status)).not.toBe(GENERIC_FILE_DETAIL);
      }
      if (hunkLabel === "Restore hunk" && HUNK_CAPABLE_STATUSES.includes(status)) {
        expect(revertConfirmDetail("hunk", status)).not.toBe(GENERIC_HUNK_DETAIL);
      }
    },
  );
});
