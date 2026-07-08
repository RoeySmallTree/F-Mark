import type {
  AnyEventRecord,
  SubagentOutputEventRecord,
  SubagentRunEventRecord,
} from "@f-mark/shared";

export type SubagentEvent = SubagentRunEventRecord | SubagentOutputEventRecord;

export type RenderItem =
  | { type: "event"; event: AnyEventRecord }
  | {
      /** A maximal run of consecutive message-prose deltas, joined into one
         markdown document. The kernel persists each streamed MessageDisplay
         delta as its own `arbitrary: true` prose file; rendering each in
         isolation breaks any markdown construct (fence, list, table) that
         straddles a delta boundary. We reconstruct the message by joining
         the run and parsing it once. */
      type: "prose-run";
      key: string;
      events: AnyEventRecord[];
      content: string;
    }
  | { type: "subagent"; key: string; events: SubagentEvent[] };

export const RENDER_ITEM_TYPES = {
  event: "event",
  proseRun: "prose-run",
  subagent: "subagent",
} as const satisfies Record<string, RenderItem["type"]>;
