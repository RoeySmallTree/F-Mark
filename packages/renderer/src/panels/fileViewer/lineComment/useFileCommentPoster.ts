import { useCallback, useState } from "react";
import type { DiffBase, LineContext, ProseMention } from "@f-mark/shared";
import { createClient } from "../../../api/client.js";
import { createManagedAgentsClient } from "../../../api/managedAgents.js";
import { scopeToBody, toRootRelative } from "../../../api/rootScope.js";
import { readCommentEndsTurn } from "../../../state/settings.js";
import { useStore } from "../../../state/store.js";
import { useFileScope } from "../fileScope.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
  comment: "comment",
  file: "file",
  comments: "comments",
} as const;

type LineRange = [number, number];

export interface PostFileCommentArgs {
  /** Absolute viewer path of the open file the comment targets. */
  absPath: string;
  /** Inclusive 1-based line range. Omitted for a FILE-LEVEL comment — e.g. the
   *  markdown overlay, whose rendered-row → source-line mapping isn't precise
   *  enough to post a line range we can stand behind (best-effort preview). */
  lines?: LineRange;
  /** Comment body. */
  content: string;
  /** Agents to ping (also woken). */
  mentions?: ProseMention[];
  /** Drift-repair re-anchor context. */
  lineContext?: LineContext;
  /** The unified-diff hunk patch text, when commenting on a diff hunk. */
  diffHunk?: string;
  /** Which diff mode/base the comment was made against (§9.1). */
  diffBase?: DiffBase;
}

export interface FileCommentPoster {
  busy: boolean;
  /** Whether a comment can currently be posted (scope + session resolvable). */
  canPost: boolean;
  /** The absolute project root the open file lives under, or null. */
  root: string | null;
  /** Post a file-comment for `absPath`. Resolves the root-relative path,
   *  posts the prose, wakes mentioned agents, refreshes events, then focuses
   *  the comments panel on the new `{kind:"file"}` target. Returns the new
   *  event filename, or null when it couldn't post. */
  postFileComment(args: PostFileCommentArgs): Promise<string | null>;
}

/* Shared file-comment posting path. Both the Monaco affordance and
   the non-code overlay call this so the wire payload + scope + wake + reveal
   stay identical (and unit-testable without a real editor). Mirrors the
   chat-document LineCommentRail.submitComment flow but targets a repo file via
   `file_path` instead of an event via `append_to`. */
export function useFileCommentPoster(): FileCommentPoster {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const currentUserId = useStore((s) => s.currentUserId);
  const token = useStore((s) => s.token);
  const participants = useStore((s) => s.participants);
  const upsertEvent = useStore((s) => s.upsertEvent);
  const setCommentTarget = useStore((s) => s.setCommentTarget);
  const setRightTab = useStore((s) => s.setRightTab);
  const { root, scope: fileScope } = useFileScope();
  const [busy, setBusy] = useState(false);

  const canPost =
    currentSessionId !== null &&
    currentUserId !== null &&
    root !== null &&
    fileScope !== null;

  const postFileComment = useCallback(
    async (args: PostFileCommentArgs): Promise<string | null> => {
      const trimmed = args.content.trim();
      if (
        trimmed.length === 0 ||
        currentSessionId === null ||
        currentUserId === null ||
        root === null ||
        fileScope === null
      ) {
        return null;
      }
      const filePath = toRootRelative(root, args.absPath);
      if (filePath === null) return null; // out-of-root — refuse the write
      /* AUTHORITATIVE scope is the file viewer's own scope (the root the open
         file actually lives under), NOT the global active project. A /file-tree
         standalone comment must post under the file's root even when the global
         active path points elsewhere — otherwise `src/a.ts` lands under the
         wrong root. `root`+`fileScope` come from the same provider, and
         `filePath` is derived from that same `root`, so they cannot drift. */
      const scope = fileScope;

      setBusy(true);
      try {
        const client = createClient({ baseUrl: "", token });
        const managedClient = createManagedAgentsClient({ baseUrl: "", token });
        const mentions = args.mentions ?? [];
        const response = await client.postProse(
          currentSessionId,
          {
            participant_id: currentUserId,
            content: trimmed,
            file_path: filePath,
            ...(args.lines !== undefined ? { lines: args.lines } : {}),
            ...(args.lineContext !== undefined
              ? { line_context: args.lineContext }
              : {}),
            ...(args.diffHunk !== undefined ? { diff_hunk: args.diffHunk } : {}),
            ...(args.diffBase !== undefined ? { diff_base: args.diffBase } : {}),
            ...(mentions.length > 0 ? { mentions } : {}),
          },
          scope,
        );

        /* Wake every mentioned agent (the authoring side has no single agent
           to default-wake the way an event-anchored comment does, since a file
           comment targets a repo path rather than an agent's prose — so the
           mention set IS the wake set). */
        const wakeTargets = new Set(
          mentions
            .map((m) => m.participant_id)
            .filter((id) => participants[id]?.kind === NO_LOOSE_STRING_VALUES.agent),
        );
        if (wakeTargets.size > 0) {
          await managedClient.wakeSession(currentSessionId, {
            reason: NO_LOOSE_STRING_VALUES.comment,
            source_event: response.filename,
            target_participant_ids: [...wakeTargets],
            ...scopeToBody(scope),
          });
        }
        if (readCommentEndsTurn()) {
          await client.postTurnEnd(currentSessionId, currentUserId, scope);
        }

        const fresh = await client.listEvents(currentSessionId, scope);
        for (const e of fresh) upsertEvent(e);

        setCommentTarget({
          kind: NO_LOOSE_STRING_VALUES.file,
          file_path: filePath,
          ...(args.lines !== undefined ? { lines: args.lines } : {}),
          /* A hunk comment focuses its `file_path::base::hunk` thread so it
             expands into the reply/resolve UI (not a separate line thread). */
          ...(args.diffHunk !== undefined ? { diff_hunk: args.diffHunk } : {}),
          ...(args.diffBase !== undefined ? { diff_base: args.diffBase } : {}),
        });
        setRightTab(NO_LOOSE_STRING_VALUES.comments);
        return response.filename;
      } finally {
        setBusy(false);
      }
    },
    [
      currentSessionId,
      currentUserId,
      root,
      fileScope,
      token,
      participants,
      upsertEvent,
      setCommentTarget,
      setRightTab,
    ],
  );

  return { busy, canPost, root, postFileComment };
}
