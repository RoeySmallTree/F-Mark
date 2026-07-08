import type { CommentTarget } from "../../../../state/storeTypes.js";
import {
  fileTargetKey,
  targetKey,
  type CommentGroup,
} from "../commentModel.js";

const NO_LOOSE_STRING_VALUES = {
  event: "event",
  file: "file",
} as const;

export function activeKeyForTarget(target: CommentTarget | null): string | null {
  if (target === null) return null;
  if (target.kind === NO_LOOSE_STRING_VALUES.event) return targetKey(target.file, target.lines);
  return fileTargetKey(target.file_path, {
    lines: target.lines,
    hunk: target.diff_hunk,
    base: target.diff_base,
  });
}

export function targetForGroup(group: CommentGroup): CommentTarget {
  if (group.filePath !== undefined) {
    return {
      kind: NO_LOOSE_STRING_VALUES.file,
      file_path: group.filePath,
      ...(group.lines === undefined ? {} : { lines: group.lines }),
      ...(group.hunk === undefined ? {} : { diff_hunk: group.hunk }),
      ...(group.base === undefined ? {} : { diff_base: group.base }),
      ...(group.lineContext === undefined
        ? {}
        : { line_context: group.lineContext }),
    };
  }
  return group.lines === undefined
    ? { kind: NO_LOOSE_STRING_VALUES.event, file: group.targetFile }
    : { kind: NO_LOOSE_STRING_VALUES.event, file: group.targetFile, lines: group.lines };
}
