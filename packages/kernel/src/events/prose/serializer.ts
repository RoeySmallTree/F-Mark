import type { ProsePayload, ProseFrontmatter } from "@f-mark/shared";
import { copyDefinedStringFields, normalizeSupersedes } from "./stringFields.js";

/**
 * Pick frontmatter keys to serialize. Event comments use
 * `append_to + mode: "comment" + lines`; file/diff comments use
 * `file_path (+ lines + diff_hunk + diff_base + line_context)`.
 */
export function pickFrontmatter(payload: ProsePayload): ProseFrontmatter {
  const out: ProseFrontmatter = {};
  copyDefinedStringFields(payload, out);
  const supersedes = normalizeSupersedes(payload.supersedes);
  if (supersedes !== undefined) out.supersedes = supersedes;
  if (payload.mode !== undefined) out.mode = payload.mode;
  if (payload.lines !== undefined) out.lines = payload.lines;
  if (payload.line_context !== undefined) out.line_context = payload.line_context;
  if (payload.removed === true) out.removed = true;
  if (payload.mentions !== undefined && payload.mentions.length > 0) {
    out.mentions = payload.mentions;
  }
  if (payload.source !== undefined) out.source = payload.source;
  if (payload.arbitrary === true) out.arbitrary = true;
  return out;
}
