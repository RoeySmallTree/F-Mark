import type {
  AnyEventRecord,
  ChoicesPayload,
  FileRefPayload,
  HtmlManifest,
  Participant,
  ProsePayload,
  TodoPayload,
} from "@f-mark/shared";
import { useStore } from "../../src/state/store.js";
import type { SessionMeta } from "../../src/api/client.js";

export const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-c92e": { kind: "agent", name: "Claude", color: "#b86a1f" },
};

export const SESSION_META: SessionMeta = {
  id: "2026-05-22-launch-planning",
  slug: "launch-planning",
  created_at: "2026-05-22T10:00:00Z",
};

export function resetStore(overrides: Partial<ReturnType<typeof useStore.getState>> = {}): void {
  useStore.setState({
    token: null,
    sessions: [SESSION_META],
    currentSessionId: SESSION_META.id,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: [],
    composeMode: "message",
    commentTarget: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    ...overrides,
  });
}

export function makeProse(
  filename: string,
  participantId: string,
  payload: Partial<ProsePayload> & { content: string },
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: participantId,
    kind: "prose",
    payload: payload as ProsePayload,
  };
}

export function makeChoices(
  filename: string,
  participantId: string,
  payload: ChoicesPayload,
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: participantId,
    kind: "choices",
    payload,
  };
}

export function makeChoice(
  filename: string,
  participantId: string,
  choicesId: string,
  selected: string[],
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: participantId,
    kind: "choice",
    payload: { choices_id: choicesId, selected },
  };
}

export function makeTodo(
  filename: string,
  participantId: string,
  payload: TodoPayload,
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: participantId,
    kind: "todo",
    payload,
  };
}

export function makeHtml(
  filename: string,
  participantId: string,
  payload: HtmlManifest,
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: participantId,
    kind: "html",
    payload,
  };
}

export function makeFile(
  filename: string,
  participantId: string,
  payload: FileRefPayload,
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: participantId,
    kind: "file",
    payload,
  };
}

export function makeTurnEnd(
  filename: string,
  participantId: string,
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: participantId,
    kind: "turn-end",
    payload: { participant_id: participantId },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
