import { expect } from "vitest";
import type {
  InjectResponse,
  ParticipantsMap,
  UserProfileFixture,
} from "./types.js";

export function expectStatus(res: InjectResponse, statusCode: number): void {
  expect(res.statusCode).toBe(statusCode);
}

export function expectUserProfileOverlay(
  participants: ParticipantsMap,
  expected: UserProfileFixture,
): void {
  const user = participantByKind(participants, "user");
  expect(user.name).toBe(expected.name);
  expect(user.color).toBe(expected.color);
  expect(user.avatar_preset).toBe(expected.avatar_preset);
}

export function expectParticipantNamed(
  participants: ParticipantsMap,
  name: string,
  expected: boolean,
): void {
  expect(Object.values(participants).some((p) => p.name === name)).toBe(
    expected,
  );
}

function participantByKind(
  participants: ParticipantsMap,
  kind: string,
): ParticipantsMap[string] {
  const participant = Object.values(participants).find((p) => p.kind === kind);
  expect(participant).toBeDefined();

  return participant!;
}
