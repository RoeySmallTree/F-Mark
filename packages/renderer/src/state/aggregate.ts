import type { AnyEventRecord } from "@f-mark/shared";
import { EventAggregator } from "./aggregate/EventAggregator.js";

/** A coalesced run of blocks consumed into a named anchor that sits earlier
 *  in the timeline (NOT directly after the anchor). The feed renders one
 *  "Added to <docName> — jump ↑" stub at the run's slot; clicking scrolls to
 *  + flashes the anchor. `newestBlockFilename` is the run's read/sort key. */
export interface ConsumedStub {
  anchorFilename: string;
  docName: string;
  newestBlockFilename: string;
  blockCount: number;
}

export interface Aggregated {
  events: AnyEventRecord[];
  visible: AnyEventRecord[];
  feed: AnyEventRecord[];
  feedDocument: AnyEventRecord[];
  feedConversation: AnyEventRecord[];
  named: AnyEventRecord[];
  commentsByTarget: Map<string, AnyEventRecord[]>;
  /** File/diff comments bucketed by `file_path::base::hunk` (when a hunk is
   *  attached) or `file_path::lines`. Parallel to commentsByTarget but keyed
   *  on a repo file path instead of an event anchor. */
  fileCommentsByPath: Map<string, AnyEventRecord[]>;
  /** Blocks whose resolved (live) parent is a visible composable parent.
   *  Sorted by the ROOT block's timestamp+filename so an edit-in-place
   *  preserves slot. */
  consumedBlocksByAnchor: Map<string, AnyEventRecord[]>;
  /** Block filenames whose `append_to` points at a missing or
   *  cycle-detected parent. Renderer surfaces these as top-level cards
   *  with an "orphaned embed" badge. */
  orphanBlocks: Set<string>;
  /** For any superseded anchor filename, the live filename at the end
   *  of its supersedes chain (deterministic — lexicographically smallest
   *  supersedor wins on forks). "cycle" if a cycle was detected. */
  liveAnchorOf: Map<string, string | "cycle">;
  /** For any revision filename, the root filename of its supersedes
   *  chain. Used to sort blocks by their original slot. */
  rootOf: Map<string, string>;
  /** Coalesced stubs for blocks consumed into an anchor that is NOT their
   *  immediately-preceding feed row (i.e. not same-turn doc building). */
  consumedStubs: ConsumedStub[];
  /** For an anchor with same-turn (adjacent) appends, the newest such block
   *  filename. The anchor's feed read key advances to this so a relit dot can
   *  clear when the anchor is read — no stub, no intervening rows to mis-mark. */
  anchorAdjacentReadKey: Map<string, string>;
  currentTurnParticipantPrefix: "us" | "ag";
}

export function aggregate(events: AnyEventRecord[]): Aggregated {
  return new EventAggregator(events).aggregate();
}
