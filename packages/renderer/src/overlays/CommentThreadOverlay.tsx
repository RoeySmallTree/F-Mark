/* CommentThreadOverlay — focused comment-thread view rendered inside the
   right panel when `store.commentTarget` is non-null. Replaces the four-tab
   right panel content while a pin is focused.

   Structure (ported from planning/redesign/design.html):
     <p.comments-on>Comments on <b>{title}</b></p>
     <div.anchor-snippet> (when commentTarget.lines is set)
     <div.thread[.resolved]> per root comment
       <div.thread-msg> (root)
       <div.thread-msg.reply> per reply
       <div.thread-actions>
         <input.reply-input>
         <button.resolve-btn[.resolved]>

   Replies + resolves both go through the API:
     - Reply: postProse({ content, in_reply_to: c.filename, target })
     - Resolve: postProse({ content: '_resolved_', supersedes: c.filename, target })

   The aggregate's supersession logic hides resolved comments from feed,
   but the overlay still surfaces them with the .resolved class so the user
   sees them dimmed and the resolve-btn shows "✓ Resolved".
*/

import { useState, type JSX, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import type {
  AnyEventRecord,
  Participant,
  ProsePayload,
} from "@f-mark/shared";
import { useStore } from "../state/store.js";
import { createClient } from "../api/client.js";
import { formatWhen, whoOf } from "../cards/format.js";

interface Props {
  targetFile: string;
  comments: AnyEventRecord[];
}

/** Returns true if some other comment with the same target.file supersedes
   `c.filename`. Used to label and style resolved threads in the overlay. */
export function isResolvedComment(
  c: AnyEventRecord,
  allComments: AnyEventRecord[],
): boolean {
  for (const other of allComments) {
    if (other.filename === c.filename) continue;
    const sup = (other.payload as { supersedes?: string }).supersedes;
    if (typeof sup === "string" && sup === c.filename) return true;
  }
  return false;
}

/** Resolve target prose's display title — uses `payload.name` if present,
   otherwise falls back to the first 40 chars of content. */
function deriveTargetTitle(target: AnyEventRecord | undefined): string {
  if (target === undefined) return "(deleted)";
  const payload = target.payload as ProsePayload;
  if (typeof payload.name === "string" && payload.name.length > 0) {
    return payload.name;
  }
  const content = (payload.content ?? "").replace(/\s+/g, " ").trim();
  if (content.length === 0) return "(empty)";
  if (content.length <= 40) return content;
  return content.slice(0, 40);
}

/** Extract the line range (1-indexed, inclusive) from the target prose's
   `content`. Returns null if lines aren't set, or out of range. */
function extractLines(
  target: AnyEventRecord | undefined,
  lines: [number, number] | undefined,
): string | null {
  if (target === undefined || lines === undefined) return null;
  const content = (target.payload as ProsePayload).content ?? "";
  const all = content.split(/\r?\n/);
  const [start, end] = lines;
  const a = Math.max(1, start);
  const b = Math.min(all.length, Math.max(a, end));
  if (a > all.length) return null;
  return all.slice(a - 1, b).join("\n");
}

interface ThreadProps {
  root: AnyEventRecord;
  allComments: AnyEventRecord[];
  participants: Record<string, Participant>;
  targetFile: string;
  lines: [number, number] | undefined;
  resolved: boolean;
  onReply: (
    root: AnyEventRecord,
    content: string,
  ) => Promise<void>;
  onResolve: (root: AnyEventRecord) => Promise<void>;
}

function Thread({
  root,
  allComments,
  participants,
  resolved,
  onReply,
  onResolve,
}: ThreadProps): JSX.Element {
  const [replyText, setReplyText] = useState("");
  const replies = allComments.filter((c) => {
    const inReply = (c.payload as { in_reply_to?: string }).in_reply_to;
    return typeof inReply === "string" && inReply === root.filename;
  });

  async function submitReply(): Promise<void> {
    const trimmed = replyText.trim();
    if (trimmed.length === 0) return;
    setReplyText("");
    await onReply(root, trimmed);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitReply();
    }
  }

  const rootWho = whoOf(root.participant_id, participants);
  const rootContent = (root.payload as ProsePayload).content ?? "";

  return (
    <div
      className={["thread", resolved ? "resolved" : ""].join(" ").trim()}
      data-root-filename={root.filename}
    >
      <ThreadMsg
        event={root}
        participants={participants}
        reply={false}
        content={rootContent}
        who={rootWho}
      />
      {replies.map((r) => {
        const w = whoOf(r.participant_id, participants);
        const c = (r.payload as ProsePayload).content ?? "";
        return (
          <ThreadMsg
            key={r.filename}
            event={r}
            participants={participants}
            reply={true}
            content={c}
            who={w}
          />
        );
      })}
      <div className="thread-actions">
        <input
          type="text"
          className="reply-input"
          placeholder="Reply…"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={onKey}
          aria-label={`Reply to ${rootWho.name}`}
        />
        <button
          type="button"
          className={["resolve-btn", resolved ? "resolved" : ""]
            .join(" ")
            .trim()}
          onClick={() => void onResolve(root)}
          disabled={resolved}
          aria-pressed={resolved}
        >
          {resolved ? "✓ Resolved" : "Resolve"}
        </button>
      </div>
    </div>
  );
}

interface ThreadMsgProps {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  reply: boolean;
  content: string;
  who: ReturnType<typeof whoOf>;
}

function ThreadMsg({
  event,
  reply,
  content,
  who,
}: ThreadMsgProps): JSX.Element {
  return (
    <div className={["thread-msg", reply ? "reply" : ""].join(" ").trim()}>
      <span
        className={["avatar", who.isUser ? "user" : "agent", "sm"].join(" ")}
        aria-hidden
      >
        {who.initial}
      </span>
      <div className="body">
        <div className="head">
          <span className="who">{who.name}</span>
          <span className="when">{formatWhen(event.timestamp)}</span>
        </div>
        <div className="txt">{content}</div>
      </div>
    </div>
  );
}

export function CommentThreadOverlay({
  targetFile,
  comments,
}: Props): JSX.Element {
  const events = useStore((s) => s.events);
  const participants = useStore((s) => s.participants);
  const setCommentTarget = useStore((s) => s.setCommentTarget);
  const commentTarget = useStore((s) => s.commentTarget);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const currentUserId = useStore((s) => s.currentUserId);
  const token = useStore((s) => s.token);
  const upsertEvent = useStore((s) => s.upsertEvent);

  const target = events.find((e) => e.filename === targetFile);
  const targetTitle = deriveTargetTitle(target);
  const lines = commentTarget?.lines;
  const quotedLines = extractLines(target, lines);

  // Roots are the comments that aren't themselves a reply to some other
  // comment with the same target. Resolved comments (where another comment
  // supersedes them) are filtered out of the aggregator's `visible` slice,
  // so `comments` here only includes non-resolved roots. We re-derive the
  // resolved state by checking the raw events for a supersession.
  const roots = comments.filter((c) => {
    const inReply = (c.payload as { in_reply_to?: string }).in_reply_to;
    return !(typeof inReply === "string" && inReply.length > 0);
  });

  // All comments that target this file (raw, including resolved/superseded).
  const allTargetComments = events.filter((e) => {
    if (e.kind !== "prose") return false;
    const t = (e.payload as ProsePayload).target;
    return t !== undefined && t.file === targetFile;
  });

  // Also fold in any visible-root comments whose supersession is itself in
  // `allTargetComments`. Hidden resolved roots come from `allTargetComments`
  // (because aggregator removes them, but the overlay should still surface
  // them in resolved style).
  const supersededFilenames = new Set<string>();
  for (const e of allTargetComments) {
    const sup = (e.payload as { supersedes?: string }).supersedes;
    if (typeof sup === "string") supersededFilenames.add(sup);
  }
  const resolvedRoots = allTargetComments.filter((c) => {
    const inReply = (c.payload as { in_reply_to?: string }).in_reply_to;
    if (typeof inReply === "string" && inReply.length > 0) return false;
    return supersededFilenames.has(c.filename);
  });
  // Combine visible roots + resolved roots, deduped by filename.
  const allRoots = [...roots];
  const seen = new Set(allRoots.map((r) => r.filename));
  for (const r of resolvedRoots) {
    if (!seen.has(r.filename)) {
      allRoots.push(r);
      seen.add(r.filename);
    }
  }

  async function postReply(
    root: AnyEventRecord,
    content: string,
  ): Promise<void> {
    if (currentSessionId === null || currentUserId === null) return;
    const client = createClient({ baseUrl: "", token });
    await client.postProse(currentSessionId, {
      participant_id: currentUserId,
      content,
      in_reply_to: root.filename,
      target: { file: targetFile, lines },
    });
    // Refresh events so the reply appears immediately.
    const fresh = await client.listEvents(currentSessionId, {});
    for (const e of fresh) upsertEvent(e);
  }

  async function postResolve(root: AnyEventRecord): Promise<void> {
    if (currentSessionId === null || currentUserId === null) return;
    const client = createClient({ baseUrl: "", token });
    await client.postProse(currentSessionId, {
      participant_id: currentUserId,
      content: "_resolved_",
      supersedes: root.filename,
      target: { file: targetFile, lines },
    });
    const fresh = await client.listEvents(currentSessionId, {});
    for (const e of fresh) upsertEvent(e);
  }

  function onClose(): void {
    setCommentTarget(null);
  }

  return (
    <>
      <div className="overlay-head">
        <p className="comments-on">
          Comments on <b>{targetTitle}</b>
        </p>
        <button
          type="button"
          className="overlay-close"
          aria-label="Close thread"
          onClick={onClose}
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className="panel-scroll">
        {quotedLines !== null && (
          <div className="anchor-snippet">
            <span className="ln">
              Lines {lines![0]}
              {lines![1] !== lines![0] ? `-${lines![1]}` : ""}
            </span>
            "{quotedLines}"
          </div>
        )}
        {allRoots.length === 0 ? (
          <p
            style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              color: "var(--ink-3)",
              fontSize: 13,
            }}
          >
            No comments on this contribution yet.
          </p>
        ) : (
          allRoots.map((root) => (
            <Thread
              key={root.filename}
              root={root}
              allComments={allTargetComments}
              participants={participants}
              targetFile={targetFile}
              lines={lines}
              resolved={isResolvedComment(root, allTargetComments)}
              onReply={postReply}
              onResolve={postResolve}
            />
          ))
        )}
      </div>
    </>
  );
}
