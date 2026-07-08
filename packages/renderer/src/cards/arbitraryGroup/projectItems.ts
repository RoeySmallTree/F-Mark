import {
  EVENT_KINDS,
  PROSE_ROLE_KINDS,
  getProseRole,
  type AnyEventRecord,
  type ProsePayload,
} from "@f-mark/shared";
import { RENDER_ITEM_TYPES, type RenderItem, type SubagentEvent } from "./types.js";

function isSubagentEvent(event: AnyEventRecord): event is SubagentEvent {
  return (
    event.kind === EVENT_KINDS.subagentRun ||
    event.kind === EVENT_KINDS.subagentOutput
  );
}

function subagentKey(event: SubagentEvent): string {
  return (
    event.payload.correlation_id ?? event.payload.subagent_id ?? event.filename
  );
}

/* A streamed assistant message delta: top-level prose with no name/target,
   the same events `proseDispatch` renders as a `MessageCard`. These are the
   only items we join — comments, anchors, and blocks keep their own cards. */
function isMessageProse(event: AnyEventRecord): boolean {
  return (
    event.kind === EVENT_KINDS.prose &&
    getProseRole(event.payload as ProsePayload).kind ===
      PROSE_ROLE_KINDS.message
  );
}

function proseRunItem(events: AnyEventRecord[]): RenderItem {
  const content = events
    .map((event) => (event.payload as ProsePayload).content)
    .join("");
  return {
    type: RENDER_ITEM_TYPES.proseRun,
    key: events[0]!.filename,
    events,
    content,
  };
}

export function projectedItems(items: AnyEventRecord[]): RenderItem[] {
  const consumed = new Set<string>();
  const out: RenderItem[] = [];
  let run: AnyEventRecord[] = [];

  const flushRun = (): void => {
    if (run.length === 0) return;
    out.push(proseRunItem(run));
    run = [];
  };

  for (const event of items) {
    if (consumed.has(event.filename)) {
      // A consumed event (a trailing subagent delta folded into an earlier
      // subagent item) is still a non-prose boundary in the original stream,
      // so it must break the current run rather than be silently skipped.
      flushRun();
      continue;
    }
    if (isMessageProse(event)) {
      run.push(event);
      continue;
    }
    flushRun();
    if (!isSubagentEvent(event)) {
      out.push({ type: RENDER_ITEM_TYPES.event, event });
      continue;
    }
    const key = subagentKey(event);
    const events = items.filter(
      (candidate): candidate is SubagentEvent =>
        isSubagentEvent(candidate) && subagentKey(candidate) === key,
    );
    for (const subEvent of events) consumed.add(subEvent.filename);
    out.push({ type: RENDER_ITEM_TYPES.subagent, key, events });
  }
  flushRun();
  return out;
}

export function isThinkingProse(event: AnyEventRecord): boolean {
  if (event.kind !== EVENT_KINDS.prose) return false;
  return (event.payload as { arbitrary?: unknown }).arbitrary === true;
}

export function lastToolUseFilename(items: RenderItem[]): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (
      item?.type === RENDER_ITEM_TYPES.event &&
      item.event.kind === EVENT_KINDS.toolUse
    ) {
      return item.event.filename;
    }
  }
  return null;
}
