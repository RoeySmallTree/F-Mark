import type { EventKind } from "@f-mark/shared";
import type { Bus, BusMessage } from "../ws/bus.js";

export interface EventPublishRecord<K extends EventKind = EventKind> {
  filename: string;
  kind: K;
  participantId: string;
  supersedes?: string;
}

export function publishEventWrite(
  bus: Bus,
  sessionId: string,
  record: EventPublishRecord,
): void {
  const added: BusMessage = {
    type: "event_added",
    session_id: sessionId,
    filename: record.filename,
    kind: record.kind,
    participant_id: record.participantId,
  };
  bus.publish(added);
  if (typeof record.supersedes === "string") {
    bus.publish({
      type: "event_superseded",
      session_id: sessionId,
      filename: record.supersedes,
      supersedes: record.filename,
    });
  }
}

export function publishEventWrites(
  bus: Bus,
  sessionId: string,
  records: EventPublishRecord[],
): void {
  for (const record of records) publishEventWrite(bus, sessionId, record);
}
