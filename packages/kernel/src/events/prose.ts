import matter from "gray-matter";
import type { ProsePayload, ProseFrontmatter } from "@f-mark/shared";

/**
 * Pick frontmatter keys to serialize. Event comments use
 * `append_to + mode: "comment" + lines`; file/diff comments use
 * `file_path (+ lines + diff_hunk + diff_base + line_context)`.
 */
function pickFrontmatter(payload: ProsePayload): ProseFrontmatter {
  const out: ProseFrontmatter = {};
  if (payload.name !== undefined) out.name = payload.name;
  if (payload.append_to !== undefined) out.append_to = payload.append_to;
  if (payload.mode !== undefined) out.mode = payload.mode;
  if (payload.lines !== undefined) out.lines = payload.lines;
  if (payload.file_path !== undefined) out.file_path = payload.file_path;
  if (payload.diff_hunk !== undefined) out.diff_hunk = payload.diff_hunk;
  if (payload.diff_base !== undefined) out.diff_base = payload.diff_base;
  if (payload.line_context !== undefined) {
    out.line_context = payload.line_context;
  }
  if (payload.removed === true) out.removed = true;
  if (payload.in_reply_to !== undefined) out.in_reply_to = payload.in_reply_to;
  if (payload.supersedes !== undefined) out.supersedes = payload.supersedes;
  if (payload.mentions !== undefined && payload.mentions.length > 0) {
    out.mentions = payload.mentions;
  }
  if (payload.source !== undefined) out.source = payload.source;
  if (payload.arbitrary === true) out.arbitrary = true;
  return out;
}

export function serializeProse(payload: ProsePayload): string {
  const fm = pickFrontmatter(payload);
  if (Object.keys(fm).length === 0) return payload.content;
  return matter.stringify(payload.content, fm);
}

/**
 * Parse a prose file into a `ProsePayload`. Event comments carry
 * `append_to + mode: "comment" + lines`; file/diff comments carry
 * `file_path (+ lines + diff_hunk + diff_base + line_context)`.
 */
export function parseProse(raw: string): ProsePayload {
  const parsed = matter(raw);
  const data = parsed.data as Partial<ProseFrontmatter>;
  const out: ProsePayload = { content: parsed.content };

  if (typeof data.name === "string") out.name = data.name;
  if (typeof data.append_to === "string") out.append_to = data.append_to;
  if (data.mode === "content" || data.mode === "comment") out.mode = data.mode;
  if (
    Array.isArray(data.lines) &&
    data.lines.length === 2 &&
    typeof data.lines[0] === "number" &&
    typeof data.lines[1] === "number"
  ) {
    out.lines = [data.lines[0], data.lines[1]];
  }
  if (typeof data.file_path === "string") out.file_path = data.file_path;
  if (typeof data.diff_hunk === "string") out.diff_hunk = data.diff_hunk;
  if (typeof data.diff_base === "string") out.diff_base = data.diff_base;
  if (
    data.line_context !== undefined &&
    data.line_context !== null &&
    typeof data.line_context === "object" &&
    typeof (data.line_context as { selected?: unknown }).selected ===
      "string" &&
    typeof (data.line_context as { sha256?: unknown }).sha256 === "string"
  ) {
    const lc = data.line_context as {
      selected: string;
      before?: unknown;
      after?: unknown;
      sha256: string;
    };
    out.line_context = {
      selected: lc.selected,
      sha256: lc.sha256,
      ...(typeof lc.before === "string" ? { before: lc.before } : {}),
      ...(typeof lc.after === "string" ? { after: lc.after } : {}),
    };
  }
  if (data.removed === true) out.removed = true;
  if (typeof data.in_reply_to === "string") out.in_reply_to = data.in_reply_to;
  if (typeof data.supersedes === "string") out.supersedes = data.supersedes;
  if (Array.isArray(data.mentions)) {
    const mentions = data.mentions.filter(
      (item): item is {
        participant_id: string;
        display_name: string;
        token: string;
      } =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as { participant_id?: unknown }).participant_id ===
          "string" &&
        typeof (item as { display_name?: unknown }).display_name ===
          "string" &&
        typeof (item as { token?: unknown }).token === "string",
    );
    if (mentions.length > 0) out.mentions = mentions;
  }
  if (
    data.source === "mcp" ||
    data.source === "hook" ||
    data.source === "manual"
  ) {
    out.source = data.source;
  }
  if (data.arbitrary === true) out.arbitrary = true;

  return out;
}
