import type {
  Participant,
  RegisteredAgent,
  UpdatedParticipant,
  UserProfile,
} from "@f-mark/shared";

import type { Client, HealthInfo } from "../client.js";
import { appendScopeQuery } from "../rootScope.js";
import type { ApiHttpClient } from "./core.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
} as const;

type IdentityMethods = Pick<
  Client,
  | "listParticipants"
  | "registerAgent"
  | "updateParticipant"
  | "getUserProfile"
  | "updateUserProfile"
  | "health"
  | "restartKernel"
>;

export function createIdentityMethods(http: ApiHttpClient): IdentityMethods {
  return {
    async listParticipants(scope) {
      const qs = new URLSearchParams();
      if (scope !== undefined) appendScopeQuery(qs, scope);
      const suffix = qs.toString();
      const body = await http.get<{ participants: Record<string, Participant> }>(
        `/participants${suffix ? `?${suffix}` : ""}`,
      );
      return body.participants;
    },
    async registerAgent(input) {
      return http.post<RegisteredAgent>("/participants/register", {
        kind: NO_LOOSE_STRING_VALUES.agent,
        ...input,
      });
    },
    async updateParticipant(id, body, scope) {
      const qs = new URLSearchParams();
      if (scope !== undefined) appendScopeQuery(qs, scope);
      const suffix = qs.toString();
      return http.patch<UpdatedParticipant>(
        `/participants/${encodeURIComponent(id)}${suffix ? `?${suffix}` : ""}`,
        body,
      );
    },
    async getUserProfile() {
      const body = await http.get<{ profile: UserProfile }>("/profile");
      return body.profile;
    },
    async updateUserProfile(body) {
      const res = await http.patch<{ profile: UserProfile }>("/profile", body);
      return res.profile;
    },
    async health() {
      return http.get<HealthInfo>("/health");
    },
    async restartKernel() {
      return http.post<{ status: string }>("/dev/restart-kernel", {});
    },
  };
}
