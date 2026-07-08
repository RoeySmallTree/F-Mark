import type { FastifyReply } from "fastify";
import type { Paths } from "../../paths.js";
import { createAgentStateStoreForRoot } from "../../services/agentState.js";
import { sessionExists } from "../../sessions.js";
import type {
  EventPublishRecord,
  PublishScope,
} from "../../services/eventPublisher.js";
import { publishEventWrites } from "../../services/eventPublisher.js";
import type { Bus } from "../../ws/bus.js";
import { ManagedAgentStatusService } from "../managedAgents/statusService.js";
import type { PathDeps } from "../pathDeps.js";
import {
  resolveKnownRootScope,
  type KnownRoot,
} from "../rootScope.js";
import type { ScopedBody } from "./types.js";

export interface EventWriteResult {
  publish: EventPublishRecord[];
  response: unknown;
}

export type ScopedWrite = (p: Paths) => Promise<EventWriteResult>;
export type RunScopedWrite = (
  body: ScopedBody | undefined,
  sessionId: string,
  reply: FastifyReply,
  write: ScopedWrite,
) => Promise<unknown>;

export async function ensureEventSession(
  p: Paths,
  sessionId: string,
  reply: FastifyReply,
): Promise<boolean> {
  if (!(await sessionExists(p, sessionId))) {
    reply.code(404).send({ error: `session not found: ${sessionId}` });
    return false;
  }
  return true;
}

export function publishScopeFor(known: KnownRoot): PublishScope {
  return known.is_active
    ? { pathId: known.path_id, revision: known.revision }
    : { pathId: known.path_id };
}

function timestampFromFilename(filename: string): string | null {
  const timestamp = filename.split("_", 1)[0];
  return typeof timestamp === "string" && timestamp.length > 0 ? timestamp : null;
}

export async function reconcileManagedAgentLifecycle(input: {
  deps: PathDeps;
  bus: Bus;
  known: KnownRoot;
  sessionId: string;
  records: EventPublishRecord[];
}): Promise<void> {
  try {
    await reconcileManagedAgentLifecycleUnsafe(input);
  } catch (error) {
  }
}

async function reconcileManagedAgentLifecycleUnsafe(input: {
  deps: PathDeps;
  bus: Bus;
  known: KnownRoot;
  sessionId: string;
  records: EventPublishRecord[];
}): Promise<void> {
  const relevant = input.records;
  if (relevant.length === 0) return;

  const state = createAgentStateStoreForRoot(
    input.known.root,
    input.deps.ref?.global() ?? input.deps.global,
  );
  const managed = new Set(await state.listManagedAgentIds());
  if (managed.size === 0) return;

  const changed = new Set<string>();
  for (const record of relevant) {
    if (!managed.has(record.participantId)) continue;
    if (record.kind === "turn-end") {
      const timestamp = timestampFromFilename(record.filename);
      await state.updateControlState(record.participantId, {
        activity_state: "turn-ended",
        last_activity_at: new Date().toISOString(),
      });
      if (timestamp !== null) {
        await state.writeInboxCursor(record.participantId, input.sessionId, timestamp);
      }
    } else {
      await state.updateControlState(record.participantId, {
        activity_state: "running",
        last_activity_at: new Date().toISOString(),
      });
    }
    changed.add(record.participantId);
  }
  if (changed.size === 0) return;

  const tmux = input.deps.getTmuxManager?.() ?? null;
  if (tmux === null) return;
  const status = new ManagedAgentStatusService({ tmux });
  const binding = {
    paths: input.known.paths,
    state,
    tmuxRoot: input.known.root,
    pathId: input.known.path_id,
    ...(input.known.is_active && input.known.revision !== undefined
      ? { revision: input.known.revision }
      : {}),
  };
  for (const participantId of changed) {
    const agent = await status.buildRow(participantId, binding);
    if (agent === null) continue;
    input.bus.publish({
      type: "managed-agent.updated",
      agent,
      pathId: input.known.path_id,
      ...(input.known.is_active && input.known.revision !== undefined
        ? { revision: input.known.revision }
        : {}),
    });
  }
}

export function createScopedWriteRunner(
  deps: PathDeps,
  getBus: () => Bus,
): RunScopedWrite {
  return async function runScopedWrite(
    body,
    sessionId,
    reply,
    write,
  ): Promise<unknown> {
    const scope = await resolveKnownRootScope(deps, {
      path_id: body?.path_id,
      root: body?.root,
    });
    if (!scope.ok) {
      reply.code(scope.status);
      return scope.body;
    }
    const p = scope.known.paths;
    if (!(await ensureEventSession(p, sessionId, reply))) return;
    try {
      const written = await write(p);
      const bus = getBus();
      await reconcileManagedAgentLifecycle({
        deps,
        bus,
        known: scope.known,
        sessionId,
        records: written.publish,
      });
      publishEventWrites(
        bus,
        sessionId,
        written.publish,
        publishScopeFor(scope.known),
      );
      return written.response;
    } catch (err) {
      reply.code(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };
}
