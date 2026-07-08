import { z } from "zod";

/**
 * Optional string param that treats "" / whitespace-only as ABSENT.
 *
 * Some MCP clients (notably opencode) populate every declared optional
 * parameter with an empty string rather than omitting it. Forwarding
 * `append_to: ""` (etc.) to the kernel routes trips their non-empty
 * validation, so an opencode agent's first `fmark_post_prose("Connected...")`
 * would fail. Use this for ref/name-style optionals (append_to, supersedes,
 * in_reply_to, name) - NOT for `content`, where an empty string is a
 * meaningful header-only anchor.
 */
export const optionalRef = (): z.ZodType<string | undefined> =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional(),
  );

export const baseContextSchema = {
  session_id: z.string().optional(),
  participant_id: z.string().optional(),
};
