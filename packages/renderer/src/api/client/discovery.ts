import type { Preset, SearchHit, SkillFile, SkillRef } from "@f-mark/shared";

import type { Client } from "../client.js";
import type { ApiHttpClient } from "./core.js";

type DiscoveryMethods = Pick<
  Client,
  "search" | "listPresets" | "listSkills" | "getSkillFile" | "saveSkillFile"
>;

export function createDiscoveryMethods(http: ApiHttpClient): DiscoveryMethods {
  return {
    async search(query, sessionId, scope, limit) {
      const qs = new URLSearchParams({ q: query });
      if (sessionId !== undefined && sessionId.length > 0) {
        qs.set("session", sessionId);
      }
      if (scope !== undefined) qs.set("scope", scope);
      if (limit !== undefined) qs.set("limit", String(limit));
      const body = await http.get<{ hits: SearchHit[] }>(`/search?${qs.toString()}`);
      return Array.isArray(body.hits) ? body.hits : [];
    },
    async listPresets(sessionId) {
      const qs = new URLSearchParams();
      if (sessionId !== undefined && sessionId.length > 0) {
        qs.set("session", sessionId);
      }
      const suffix = qs.toString();
      const path = `/presets${suffix ? `?${suffix}` : ""}`;
      return http.get<{ builtin: Preset[]; project: Preset[] }>(path);
    },
    async listSkills(agent) {
      const qs = new URLSearchParams();
      if (agent !== undefined && agent.length > 0) {
        qs.set("agent", agent);
      }
      const suffix = qs.toString();
      const path = `/skills${suffix ? `?${suffix}` : ""}`;
      return http.get<{ skills: SkillRef[] }>(path);
    },
    async getSkillFile(path) {
      const qs = new URLSearchParams({ path });
      return http.get<SkillFile>(`/skills/detail?${qs.toString()}`);
    },
    async saveSkillFile(input) {
      return http.put<SkillFile>("/skills/detail", input);
    },
  };
}
