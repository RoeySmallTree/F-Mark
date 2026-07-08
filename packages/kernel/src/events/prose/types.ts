import type { ProsePayload } from "@f-mark/shared";

export type ProseMention = NonNullable<ProsePayload["mentions"]>[number];
export type LineContext = NonNullable<ProsePayload["line_context"]>;

// `supersedes` is intentionally NOT here: it accepts a string OR a string[]
// (a coalesced message hides many delta files), handled on its own path.
export type StringFrontmatterKey =
  | "name"
  | "append_to"
  | "file_path"
  | "diff_hunk"
  | "diff_base"
  | "in_reply_to";

export const STRING_FRONTMATTER_KEYS: StringFrontmatterKey[] = [
  "name",
  "append_to",
  "file_path",
  "diff_hunk",
  "diff_base",
  "in_reply_to",
];
