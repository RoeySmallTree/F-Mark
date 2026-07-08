import type { GitFileStatus, GitHunk } from "@f-mark/shared";
import type { ParsedLine } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  renamed: "renamed",
  binaryRenamed: "binary-renamed",
  add: "add",
  del: "del",
  ctx: "ctx",
} as const;

const FILE_STATUS_LABELS: Partial<Record<GitFileStatus, string>> = {
  deleted: "Deleted file",
  "binary-deleted": "Deleted file",
  added: "Added file",
  "binary-added": "Added file",
  untracked: "Untracked file",
  "binary-untracked": "Untracked file",
};

function isRenameStatus(status: GitFileStatus): boolean {
  return status === NO_LOOSE_STRING_VALUES.renamed || status === NO_LOOSE_STRING_VALUES.binaryRenamed;
}

/** Human-readable header for the file-level action strip. */
export function fileStatusLabel(
  status: GitFileStatus,
  oldPath: string | undefined,
): string {
  if (isRenameStatus(status) && oldPath !== undefined) {
    return `Renamed from ${oldPath}`;
  }
  return FILE_STATUS_LABELS[status] ?? "File changes";
}

/** Expand a hunk body into typed lines with old/new line numbers. */
export function expandHunk(hunk: GitHunk): ParsedLine[] {
  const out: ParsedLine[] = [];
  let oldNo = hunk.old_start;
  let newNo = hunk.new_start;
  for (const raw of hunk.patch.split("\n")) {
    if (raw.startsWith("\\")) continue;
    if (raw.length === 0) continue;
    const sign = raw[0];
    const text = raw.slice(1);
    if (sign === "+") {
      out.push({ kind: NO_LOOSE_STRING_VALUES.add, text, oldNo: null, newNo: newNo++ });
    } else if (sign === "-") {
      out.push({ kind: NO_LOOSE_STRING_VALUES.del, text, oldNo: oldNo++, newNo: null });
    } else if (sign === " ") {
      out.push({ kind: NO_LOOSE_STRING_VALUES.ctx, text, oldNo: oldNo++, newNo: newNo++ });
    }
  }
  return out;
}

export function visibleLineText(text: string): string {
  return text.length > 0 ? text : " ";
}
