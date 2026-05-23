import matter from "gray-matter";
import type { ProsePayload, ProseFrontmatter } from "@f-mark/shared";

/**
 * Pick frontmatter keys to serialize. Never emits the legacy `target`
 * field — comments now use `append_to + mode: "comment" + lines`.
 */
function pickFrontmatter(payload: ProsePayload): ProseFrontmatter {
  const out: ProseFrontmatter = {};
  if (payload.name !== undefined) out.name = payload.name;
  if (payload.append_to !== undefined) out.append_to = payload.append_to;
  if (payload.mode !== undefined) out.mode = payload.mode;
  if (payload.lines !== undefined) out.lines = payload.lines;
  if (payload.removed === true) out.removed = true;
  if (payload.in_reply_to !== undefined) out.in_reply_to = payload.in_reply_to;
  if (payload.supersedes !== undefined) out.supersedes = payload.supersedes;
  if (payload.arbitrary === true) out.arbitrary = true;
  return out;
}

export function serializeProse(payload: ProsePayload): string {
  const fm = pickFrontmatter(payload);
  if (Object.keys(fm).length === 0) return payload.content;
  return matter.stringify(payload.content, fm);
}

/**
 * Parse a prose file. Maps legacy `target` onto the new
 * `append_to + mode: "comment" + lines` shape on read so consumers only
 * see the new shape in memory. If BOTH legacy `target` AND any new field
 * are present, we prefer the new fields and warn. The returned payload
 * never carries `target`.
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
  if (data.removed === true) out.removed = true;
  if (typeof data.in_reply_to === "string") out.in_reply_to = data.in_reply_to;
  if (typeof data.supersedes === "string") out.supersedes = data.supersedes;
  if (data.arbitrary === true) out.arbitrary = true;

  /* Legacy `target` back-compat: map onto `append_to + mode=comment + lines`.
     If the file ALSO has any new field, we prefer the new fields and warn
     — the legacy field is then dropped. */
  if (
    data.target !== undefined &&
    data.target !== null &&
    typeof data.target === "object" &&
    typeof (data.target as { file?: unknown }).file === "string"
  ) {
    const t = data.target as { file: string; lines?: [number, number] };
    const hasNewFields =
      out.append_to !== undefined ||
      out.mode !== undefined ||
      out.lines !== undefined;
    if (hasNewFields) {
      // eslint-disable-next-line no-console
      console.warn(
        "parseProse: both legacy `target` and new fields present; preferring new shape, dropping legacy target",
      );
    } else {
      out.append_to = t.file;
      out.mode = "comment";
      if (
        Array.isArray(t.lines) &&
        t.lines.length === 2 &&
        typeof t.lines[0] === "number" &&
        typeof t.lines[1] === "number"
      ) {
        out.lines = [t.lines[0], t.lines[1]];
      }
    }
  }

  return out;
}
