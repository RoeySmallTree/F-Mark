import type { EventKind } from "@f-mark/shared";
import type { Bus, BusMessage } from "../ws/bus.js";

export interface EventPublishRecord<K extends EventKind = EventKind> {
  filename: string;
  kind: K;
  participantId: string;
  /** Scalar for a revision; array when a coalesced message hides many files. */
  supersedes?: string | string[];
}

function supersededTargets(supersedes: string | string[] | undefined): string[] {
  if (typeof supersedes === "string") return supersedes.length > 0 ? [supersedes] : [];
  if (Array.isArray(supersedes)) {
    return supersedes.filter((item) => typeof item === "string" && item.length > 0);
  }
  return [];
}

/* Root-scope envelope for published event writes. When a write targets a
   specific (possibly background) root, the caller passes `{ pathId }` so the
   WS envelope carries that pathId instead of the active one — the renderer
   then filters by pathId. For background roots `revision` is omitted so the
   bus wrapper does not inject the active revision (see ws/envelope.ts). */
export interface PublishScope {
  pathId?: string | null;
  revision?: number;
}

export function publishEventWrite(
  bus: Bus,
  sessionId: string,
  record: EventPublishRecord,
  scope: PublishScope = {},
): void {
  const added: BusMessage = {
    type: "event_added",
    session_id: sessionId,
    filename: record.filename,
    kind: record.kind,
    participant_id: record.participantId,
    ...(scope.pathId !== undefined ? { pathId: scope.pathId } : {}),
    ...(scope.revision !== undefined ? { revision: scope.revision } : {}),
  };
  bus.publish(added);
  for (const target of supersededTargets(record.supersedes)) {
    bus.publish({
      type: "event_superseded",
      session_id: sessionId,
      filename: target,
      supersedes: record.filename,
      ...(scope.pathId !== undefined ? { pathId: scope.pathId } : {}),
      ...(scope.revision !== undefined ? { revision: scope.revision } : {}),
    });
  }
}

export function publishEventWrites(
  bus: Bus,
  sessionId: string,
  records: EventPublishRecord[],
  scope: PublishScope = {},
): void {
  for (const record of records) publishEventWrite(bus, sessionId, record, scope);
}
