import matter from "gray-matter";
import type { ProsePayload, ProseFrontmatter } from "@f-mark/shared";
import { ProseFrontmatterParser } from "./prose/parser.js";
import { pickFrontmatter } from "./prose/serializer.js";

export function serializeProse(payload: ProsePayload): string {
  const frontmatter = pickFrontmatter(payload);
  if (Object.keys(frontmatter).length === 0) return payload.content;
  return matter.stringify(payload.content, frontmatter);
}

/**
 * Parse a prose file into a `ProsePayload`. Event comments carry
 * `append_to + mode: "comment" + lines`; file/diff comments carry
 * `file_path (+ lines + diff_hunk + diff_base + line_context)`.
 */
export function parseProse(raw: string): ProsePayload {
  const parsed = matter(raw);
  return new ProseFrontmatterParser(
    parsed.data as Partial<ProseFrontmatter>,
    parsed.content,
  ).parse();
}
