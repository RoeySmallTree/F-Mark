import type { AnyEventRecord, Participant } from "@f-mark/shared";

export interface EventCardProps {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  comments: AnyEventRecord[];
  allEvents: AnyEventRecord[];
  /** Filenames of events that are rendered inside an anchor ProseCard
   *  (consumed blocks). Top-level dispatch returns null for these so they
   *  don't show twice. Default `undefined` means "no filter" — keeps
   *  existing tests + call sites green while Feed.tsx threads the real
   *  set in. */
  consumedFilenames?: Set<string>;
  /** Blocks resolved to this anchor's filename — only used when
   *  `event` is a prose anchor and `ProseCard` composes them in. */
  blocks?: AnyEventRecord[];
  /** Per-block comment lookup — threaded into `ProseCard` so each
   *  block's LineCommentRail sees its own comment list. */
  commentsByFilename?: Map<string, AnyEventRecord[]>;
  /** Optional live-toolbox control for tool-use cards. When provided,
   *  the child tool card syncs to this open state whenever the revision
   *  changes, while still allowing local clicks between live updates. */
  toolAutoOpen?: boolean;
  toolAutoOpenRevision?: string;
  /** Animate message-style prose as it first appears in the live feed. */
  revealWords?: boolean;
}
