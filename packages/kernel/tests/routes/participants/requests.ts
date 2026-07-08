import { expect } from "vitest";
import { expectStatus } from "./assertions.js";
import type {
  InjectResponse,
  ParticipantsApp,
  ParticipantsMap,
  PatchParticipantPayload,
  RegisterParticipantPayload,
} from "./types.js";

export async function getParticipantsMap(
  app: ParticipantsApp,
  pathId?: string,
): Promise<ParticipantsMap> {
  const res = await app.inject({ method: "GET", url: participantsUrl(pathId) });
  expectStatus(res, 200);

  return responseJson<{ participants: ParticipantsMap }>(res).participants;
}

export async function getUserId(app: ParticipantsApp): Promise<string> {
  const participants = await getParticipantsMap(app);

  return participantIdByKind(participants, "user");
}

export function registerParticipant(
  app: ParticipantsApp,
  payload: RegisterParticipantPayload,
  pathId?: string,
): Promise<InjectResponse> {
  return app.inject({
    method: "POST",
    url: registerParticipantUrl(pathId),
    payload,
  });
}

export function patchParticipant(
  app: ParticipantsApp,
  participantId: string,
  payload: PatchParticipantPayload,
): Promise<InjectResponse> {
  return app.inject({
    method: "PATCH",
    url: `/participants/${participantId}`,
    payload,
  });
}

export async function patchUserParticipant(
  app: ParticipantsApp,
  payload: PatchParticipantPayload,
): Promise<InjectResponse> {
  return patchParticipant(app, await getUserId(app), payload);
}

export function responseJson<T>(res: InjectResponse): T {
  return res.json() as T;
}

function participantIdByKind(
  participants: ParticipantsMap,
  kind: string,
): string {
  const found = Object.entries(participants).find(
    ([, participant]) => participant.kind === kind,
  );
  expect(found).toBeDefined();

  return found![0];
}

function participantsUrl(pathId?: string): string {
  return pathId ? `/participants?${pathIdQuery(pathId)}` : "/participants";
}

function registerParticipantUrl(pathId?: string): string {
  return pathId
    ? `/participants/register?${pathIdQuery(pathId)}`
    : "/participants/register";
}

function pathIdQuery(pathId: string): string {
  return new URLSearchParams({ path_id: pathId }).toString();
}
