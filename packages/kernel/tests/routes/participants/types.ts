import type { ActivePaths } from "../../../src/paths/active.js";
import type { PathContextRef } from "../../../src/paths/contextRef.js";
import type { GlobalPaths } from "../../../src/paths/global.js";
import type { Paths } from "../../../src/paths.js";
import type { CreatedServer } from "../../../src/server.js";

export type ParticipantsApp = CreatedServer["app"];

export interface InjectResponse {
  statusCode: number;
  json(): unknown;
}

export type ParticipantsMap = Record<
  string,
  {
    active_session?: string | null;
    avatar_preset?: string;
    color?: string;
    kind?: string;
    name?: string;
  }
>;

export type RegisterParticipantPayload = {
  kind: string;
  name?: string;
  suggested_id?: string;
};

export type PatchParticipantPayload = {
  avatar_preset?: string | null;
  color?: string;
  name?: string;
};

export type UserProfileFixture = {
  avatar_preset: string;
  color: string;
  name: string;
};

export interface ParticipantsAppContext {
  app: ParticipantsApp;
}

export interface OtherPathContext extends ParticipantsAppContext {
  fallbackPathId: string;
  fallbackRoot: string;
  global: GlobalPaths;
  otherActive: ActivePaths;
  otherPathId: string;
  otherRoot: string;
}

export interface OtherActivePathContext extends OtherPathContext {
  ref: PathContextRef;
}

export interface RegisteredOtherPathContext extends OtherPathContext {
  ref: PathContextRef;
}

export type InitializedOtherPathContext = Omit<OtherPathContext, "app"> & {
  configRoot: string;
  fallback: Paths;
};
