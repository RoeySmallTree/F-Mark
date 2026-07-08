import { createHash } from "node:crypto";
import type { Paths } from "../../paths.js";
import { readEvents } from "../../events/reader.js";
import { publishEventWrites } from "../../services/eventPublisher.js";
import { writeProseEvent } from "../../services/events.js";
import { sessionExists } from "../../sessions.js";
import {
  codexSessionsRoot,
  findManagedCodexRollout,
  readCodexLiveTextEntries,
} from "../../services/codexRolloutLiveText.js";
import type { Bus } from "../../ws/bus.js";
import { terminalPollerKeyFor } from "./runtimeArgs.js";
import type { ManagedAgentRootBinding } from "./types.js";

const CODEX_LIVE_TEXT_POLL_MS = 1000;
const CODEX_LIVE_TEXT_POLL_TTL_MS = 30 * 60 * 1000;
const CODEX_LIVE_TEXT_ROLLOUT_GRACE_MS = 5000;

interface CodexLiveTextCursor {
  rolloutPath: string | null;
  line: number;
  seen: Set<string>;
  notBeforeMs: number;
}

interface ManagedAgentCodexLiveTextPollingDeps {
  bus: Bus;
  integrationEnv: NodeJS.ProcessEnv;
  bindingFor(
    binding?: ManagedAgentRootBinding | null,
  ): ManagedAgentRootBinding;
  publishAgentUpdated(
    participantId: string,
    binding?: ManagedAgentRootBinding | null,
  ): Promise<void>;
}

export class ManagedAgentCodexLiveTextPolling {
  private readonly pollers = new Map<string, NodeJS.Timeout>();
  private readonly cursors = new Map<string, CodexLiveTextCursor>();

  constructor(private readonly deps: ManagedAgentCodexLiveTextPollingDeps) {}

  schedule(input: {
    participantId: string;
    sessionId: string | null | undefined;
    runtimeId: string | null | undefined;
    binding?: ManagedAgentRootBinding | null;
    reset?: boolean;
  }): void {
    if (input.runtimeId !== "codex") return;
    if (typeof input.sessionId !== "string" || input.sessionId.length === 0) {
      return;
    }
    const sessionId = input.sessionId;
    const pollerKey = this.pollerKey({
      participantId: input.participantId,
      sessionId,
      binding: input.binding,
    });
    if (input.reset === true) {
      const existing = this.pollers.get(pollerKey);
      if (existing !== undefined) clearTimeout(existing);
      this.pollers.delete(pollerKey);
      this.cursors.delete(pollerKey);
    }
    if (this.pollers.has(pollerKey)) return;
    const startedAt = Date.now();
    const cursor = this.cursors.get(pollerKey) ?? {
      rolloutPath: null,
      line: 0,
      seen: new Set<string>(),
      notBeforeMs: startedAt - CODEX_LIVE_TEXT_ROLLOUT_GRACE_MS,
    };
    this.cursors.set(pollerKey, cursor);

    const tick = async (): Promise<void> => {
      try {
        const bound = this.deps.bindingFor(input.binding);
        const p = bound.paths;
        if (!(await sessionExists(p, sessionId))) {
          // Session ids are immutable, so a missing session means it was
          // deleted — stop polling for good.
          this.pollers.delete(pollerKey);
          this.cursors.delete(pollerKey);
          return;
        }
        if (cursor.rolloutPath === null) {
          cursor.rolloutPath = await findManagedCodexRollout({
            sessionsRoot: codexSessionsRoot(this.deps.integrationEnv),
            projectRoot: p.root(),
            participantId: input.participantId,
            sessionId,
            notBeforeMs: cursor.notBeforeMs,
          });
        }
        if (cursor.rolloutPath !== null) {
          await this.publishNewEntries({
            input: { ...input, sessionId },
            cursor,
            p,
          });
        }
      } catch {
        /* Rollout live text is best-effort; hooks/MCP remain canonical. */
      }
      if (Date.now() - startedAt >= CODEX_LIVE_TEXT_POLL_TTL_MS) {
        this.pollers.delete(pollerKey);
        return;
      }
      const timer = setTimeout(tick, CODEX_LIVE_TEXT_POLL_MS);
      timer.unref?.();
      this.pollers.set(pollerKey, timer);
    };
    const timer = setTimeout(tick, CODEX_LIVE_TEXT_POLL_MS);
    timer.unref?.();
    this.pollers.set(pollerKey, timer);
  }

  private async publishNewEntries(input: {
    input: {
      participantId: string;
      sessionId: string;
      binding?: ManagedAgentRootBinding | null;
    };
    cursor: CodexLiveTextCursor;
    p: Paths;
  }): Promise<void> {
    const result = await readCodexLiveTextEntries({
      rolloutPath: input.cursor.rolloutPath!,
      afterLine: input.cursor.line,
      notBeforeMs: input.cursor.notBeforeMs,
    });
    input.cursor.line = result.nextLine;
    for (const entry of result.entries) {
      const fingerprint = codexLiveTextFingerprint({
        participantId: input.input.participantId,
        sessionId: input.input.sessionId,
        content: entry.content,
      });
      if (input.cursor.seen.has(fingerprint)) continue;
      input.cursor.seen.add(fingerprint);
      await this.publishCodexLiveText({
        p: input.p,
        sessionId: input.input.sessionId,
        participantId: input.input.participantId,
        content: entry.content,
        binding: input.input.binding,
      });
    }
  }

  private async publishCodexLiveText(input: {
    p: Paths;
    sessionId: string;
    participantId: string;
    content: string;
    binding?: ManagedAgentRootBinding | null;
  }): Promise<void> {
    if (
      await participantCurrentTurnIsClosed({
        p: input.p,
        sessionId: input.sessionId,
        participantId: input.participantId,
      })
    ) {
      return;
    }
    if (
      await proseContentAlreadyExists({
        p: input.p,
        sessionId: input.sessionId,
        participantId: input.participantId,
        content: input.content,
      })
    ) {
      return;
    }
    const written = await writeProseEvent(input.p, input.sessionId, {
      participant_id: input.participantId,
      content: input.content,
      arbitrary: true,
      source: "hook",
    });
    const bound = this.deps.bindingFor(input.binding);
    await bound.state.updateControlState(input.participantId, {
      activity_state: "running",
      last_activity_at: new Date().toISOString(),
    });
    publishEventWrites(
      this.deps.bus,
      input.sessionId,
      written.publish,
      bound.pathId !== undefined
        ? {
            pathId: bound.pathId,
            ...(bound.revision !== undefined ? { revision: bound.revision } : {}),
          }
        : undefined,
    );
    await this.deps.publishAgentUpdated(input.participantId, bound);
  }

  private pollerKey(input: {
    participantId: string;
    sessionId: string;
    binding?: ManagedAgentRootBinding | null;
  }): string {
    const bound = this.deps.bindingFor(input.binding);
    return `${terminalPollerKeyFor(
      bound.pathId ?? bound.tmuxRoot ?? "",
      input.participantId,
    )}::${input.sessionId}`;
  }
}

function codexLiveTextFingerprint(input: {
  participantId: string;
  sessionId: string;
  content: string;
}): string {
  return createHash("sha256")
    .update(input.participantId)
    .update("\0")
    .update(input.sessionId)
    .update("\0")
    .update(normalizeCodexLiveText(input.content))
    .digest("hex");
}

function normalizeCodexLiveText(content: string): string {
  return content.replace(/\r\n/g, "\n").trim();
}

async function participantCurrentTurnIsClosed(input: {
  p: Paths;
  sessionId: string;
  participantId: string;
}): Promise<boolean> {
  let events;
  try {
    events = await readEvents(input.p, input.sessionId, {});
  } catch {
    return false;
  }
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event === undefined) continue;
    if (event.participant_id === input.participantId) {
      return event.kind === "turn-end";
    }
    if (event.participant_id.startsWith("us")) return false;
  }
  return false;
}

async function proseContentAlreadyExists(input: {
  p: Paths;
  sessionId: string;
  participantId: string;
  content: string;
}): Promise<boolean> {
  const events = await readEvents(input.p, input.sessionId, {
    kinds: ["prose"],
  });
  return events.some((event) => {
    if (event.participant_id !== input.participantId) return false;
    if (event.kind !== "prose") return false;
    const payload = event.payload;
    if (payload === null || typeof payload !== "object") return false;
    const content = (payload as { content?: unknown }).content;
    if (typeof content !== "string") return false;
    return (
      normalizeCodexLiveText(content) === normalizeCodexLiveText(input.content)
    );
  });
}
