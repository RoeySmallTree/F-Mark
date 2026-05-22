import matter from "gray-matter";
import type { ProsePayload, ProseFrontmatter } from "@f-mark/shared";

function pickFrontmatter(payload: ProsePayload): ProseFrontmatter {
  const out: ProseFrontmatter = {};
  if (payload.name !== undefined) out.name = payload.name;
  if (payload.target !== undefined) out.target = payload.target;
  if (payload.in_reply_to !== undefined) out.in_reply_to = payload.in_reply_to;
  if (payload.supersedes !== undefined) out.supersedes = payload.supersedes;
  return out;
}

export function serializeProse(payload: ProsePayload): string {
  const fm = pickFrontmatter(payload);
  if (Object.keys(fm).length === 0) return payload.content;
  return matter.stringify(payload.content, fm);
}

export function parseProse(raw: string): ProsePayload {
  const parsed = matter(raw);
  const data = parsed.data as Partial<ProseFrontmatter>;
  const out: ProsePayload = { content: parsed.content };
  if (typeof data.name === "string") out.name = data.name;
  if (data.target && typeof data.target === "object") {
    out.target = data.target as ProsePayload["target"];
  }
  if (typeof data.in_reply_to === "string") out.in_reply_to = data.in_reply_to;
  if (typeof data.supersedes === "string") out.supersedes = data.supersedes;
  return out;
}
