export interface ValidateInput {
  /** Frontmatter+content fields the caller intends to write. */
  content?: string;
  name?: string;
  append_to?: unknown;
  mode?: unknown;
  lines?: unknown;
  removed?: unknown;
  /** File/diff comment target. Mutually exclusive with `append_to`/`mode`. */
  file_path?: unknown;
}

export type ValidateResult = { ok: true } | { ok: false; error: string };
