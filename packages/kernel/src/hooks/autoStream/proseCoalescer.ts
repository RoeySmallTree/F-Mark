import type { AnyEventRecord, ProsePayload } from "@f-mark/shared";
import { getProseRole } from "@f-mark/shared";
import { paths as makePaths } from "../../paths.js";
import { readEvents } from "../../events/reader.js";
import { applySupersession } from "../../events/supersession.js";
import type { ProjectedEvent } from "../projectTurn.js";

interface CoalesceInput {
  projectRoot: string;
  sessionId: string;
  participantId: string;
  events: ProjectedEvent[];
}

interface DeltaRun {
  filenames: string[];
  firstTimestamp: string;
  key: string;
}

interface WindowData {
  runs: DeltaRun[];
  /** Same-window MCP-posted full messages, keyed by match key — used to
     collapse the agent-posted duplicate of a streamed message. */
  mcp: Array<{ filename: string; key: string }>;
}

/**
 * At assistant Stop, the transcript projection holds the CLEAN whole-message
 * text blocks. The live stream wrote each block as a run of `arbitrary: true`
 * delta files (and the agent may also have MCP-posted the same text). This
 * annotates each projected prose block with `supersedes` pointing at the delta
 * run — and any MCP duplicate — it replaces, so the canonical coalesced event
 * hides its fragments from search / MCP / inbox.
 *
 * Matching is by CONTENT, per block, in order. The match key strips all
 * whitespace: gray-matter injects a trailing newline into any delta not ending
 * in one, so `join(stored deltas)` carries boundary newlines the transcript
 * block lacks (and a mid-word split turns into a stray space). Whitespace-
 * insensitive comparison is robust to both. A block that matches no run is left
 * uncoalesced (its raw deltas stay; the renderer join still displays them) —
 * one mismatch never disables coalescing for the rest of the turn.
 */
export class StopProseCoalescer {
  async coalesce(input: CoalesceInput): Promise<ProjectedEvent[]> {
    const blocks = input.events.filter((event) => event.kind === "prose");
    if (blocks.length === 0) return input.events;
    const { runs, mcp } = await this.windowData(input);

    // Match by key, but only on an UNAMBIGUOUS key: exactly one transcript
    // block AND at most one run/MCP set share it. The whitespace-stripped key
    // is lossy (it must tolerate gray-matter's boundary newlines), so a
    // collision — e.g. a stray live "Done" run before the real "Done" — would
    // otherwise risk superseding the wrong files. When a key is ambiguous we
    // skip it: the raw deltas stay and the renderer join still displays them.
    const blockKeyCounts = countKeys(blocks.map((b) => matchKey(b.content)));
    const runsByKey = groupBy(runs, (run) => run.key);
    const mcpByKey = groupBy(mcp, (entry) => entry.key);

    return input.events.map((event) => {
      if (event.kind !== "prose") return event;
      const key = matchKey(event.content);
      if (blockKeyCounts.get(key) !== 1) return event;

      const keyRuns = runsByKey.get(key) ?? [];
      const mcpDuplicates = (mcpByKey.get(key) ?? []).map((m) => m.filename);
      if (keyRuns.length > 1) return event; // ambiguous run — skip

      if (keyRuns.length === 0) {
        // No streamed run. Still collapse a same-content MCP duplicate of a
        // concluding message into this canonical event.
        if (mcpDuplicates.length > 0 && event.arbitrary === false) {
          return { ...event, supersedes: mcpDuplicates };
        }
        return event;
      }

      const run = keyRuns[0]!;
      // Worth coalescing when there is something to gain: ≥2 fragments to merge,
      // a streamed delta to promote to the concluding canonical message, or an
      // MCP duplicate to collapse. A lone arbitrary delta with no duplicate has
      // none — leave it for the existing dedup to drop the transcript copy.
      const worth =
        run.filenames.length >= 2 ||
        event.arbitrary === false ||
        mcpDuplicates.length > 0;
      if (!worth) return event;
      // Stamp at the run's first delta so the canonical event keeps its place
      // ahead of any following tool-use in visible reads (the writer
      // collision-bumps past the run's own delta filenames). Edge: a long run
      // whose bumped stamp reaches the millisecond of an immediately-following
      // lexically-before-prose boundary (access-request/choices/file/flow/html)
      // can invert order. Rare; see coalescing-impl.md.
      return {
        ...event,
        supersedes: [...run.filenames, ...mcpDuplicates],
        timestamp: run.firstTimestamp,
      };
    });
  }

  private async windowData(input: CoalesceInput): Promise<WindowData> {
    const raw = await this.safeReadEvents(input.projectRoot, input.sessionId);
    const visible = new Set(applySupersession(raw).map((event) => event.filename));
    const window = this.turnWindow(raw, input.participantId);

    const runs: DeltaRun[] = [];
    const mcp: WindowData["mcp"] = [];
    let current: AnyEventRecord[] = [];
    const flush = (): void => {
      if (current.length === 0) return;
      runs.push({
        filenames: current.map((event) => event.filename),
        firstTimestamp: filenameTimestamp(current[0]!.filename),
        key: matchKey(current.map((event) => proseContent(event)).join("")),
      });
      current = [];
    };
    for (const event of window) {
      if (this.isDeltaProse(event, input.participantId, visible)) {
        current.push(event);
        continue;
      }
      flush();
      if (this.isMcpMessageProse(event, input.participantId, visible)) {
        mcp.push({ filename: event.filename, key: matchKey(proseContent(event)) });
      }
    }
    flush();
    return { runs, mcp };
  }

  /** Events after the later of this participant's last turn-end or the last
     user event — i.e. the current turn. */
  private turnWindow(
    raw: AnyEventRecord[],
    participantId: string,
  ): AnyEventRecord[] {
    let start = -1;
    for (let i = raw.length - 1; i >= 0; i--) {
      const event = raw[i]!;
      const isOwnTurnEnd =
        event.participant_id === participantId && event.kind === "turn-end";
      const isUser = event.participant_id.startsWith("us");
      if (isOwnTurnEnd || isUser) {
        start = i;
        break;
      }
    }
    return raw.slice(start + 1);
  }

  private isDeltaProse(
    event: AnyEventRecord,
    participantId: string,
    visible: Set<string>,
  ): boolean {
    return (
      this.isMessageProse(event, participantId, visible) &&
      (event.payload as ProsePayload).source === "hook" &&
      (event.payload as ProsePayload).arbitrary === true
    );
  }

  private isMcpMessageProse(
    event: AnyEventRecord,
    participantId: string,
    visible: Set<string>,
  ): boolean {
    return (
      this.isMessageProse(event, participantId, visible) &&
      (event.payload as ProsePayload).source === "mcp"
    );
  }

  private isMessageProse(
    event: AnyEventRecord,
    participantId: string,
    visible: Set<string>,
  ): boolean {
    if (event.participant_id !== participantId) return false;
    if (event.kind !== "prose") return false;
    if (!visible.has(event.filename)) return false;
    const payload = event.payload as ProsePayload;
    return (
      getProseRole(payload).kind === "message" &&
      payload.content.trim().length > 0
    );
  }

  private async safeReadEvents(
    projectRoot: string,
    sessionId: string,
  ): Promise<AnyEventRecord[]> {
    try {
      return await readEvents(makePaths(projectRoot), sessionId, {});
    } catch {
      return [];
    }
  }
}

function countKeys(keys: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return groups;
}

function proseContent(event: AnyEventRecord): string {
  return (event.payload as ProsePayload).content;
}

/** Whitespace-insensitive key: gray-matter injects newlines at delta
   boundaries, so the stored join differs from the transcript block only in
   whitespace. */
function matchKey(value: string): string {
  return value.replace(/\s+/g, "");
}

function filenameTimestamp(filename: string): string {
  return filename.split("_")[0] ?? "";
}
