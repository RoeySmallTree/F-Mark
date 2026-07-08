import type { PostProseBody } from "../../../../api/client.js";
import type { CommentGroup } from "../commentModel.js";
import type { CommentPostBody } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  comment: "comment",
} as const;

export function buildPostProseBody(
  currentUserId: string,
  group: CommentGroup,
  body: CommentPostBody,
): PostProseBody {
  return {
    participant_id: currentUserId,
    ...targetBodyForGroup(group),
    ...body,
  };
}

function targetBodyForGroup(group: CommentGroup): Partial<PostProseBody> {
  if (group.filePath !== undefined) {
    return {
      file_path: group.filePath,
      ...(group.lines === undefined ? {} : { lines: group.lines }),
      ...(group.hunk === undefined ? {} : { diff_hunk: group.hunk }),
      ...(group.base === undefined ? {} : { diff_base: group.base }),
    };
  }
  return {
    append_to: group.targetFile,
    mode: NO_LOOSE_STRING_VALUES.comment,
    ...(group.lines === undefined ? {} : { lines: group.lines }),
  };
}
