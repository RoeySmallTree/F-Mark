import type { AnyEventRecord, LineContext, ProsePayload } from "@f-mark/shared";
import { getFileCommentTarget } from "@f-mark/shared";
import type { LineRange } from "../panels/fileViewer/lineComment/lineMeasure.js";

/** Find line_context from the first matching file comment on the given path/lines. */
export function lineContextForFileComment(
  events: AnyEventRecord[],
  filePath: string,
  lines: LineRange,
): LineContext | undefined {
  for (const event of events) {
    const payload = event.payload as ProsePayload;
    const target = getFileCommentTarget(payload);
    if (target === undefined) continue;
    if (target.file_path !== filePath) continue;
    if (
      target.lines === undefined ||
      target.lines[0] !== lines[0] ||
      target.lines[1] !== lines[1]
    ) {
      continue;
    }
    if (payload.line_context !== undefined) return payload.line_context;
  }
  return undefined;
}
