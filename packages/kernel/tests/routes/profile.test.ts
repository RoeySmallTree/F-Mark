import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject, readConfig } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { globalPaths } from "../../src/paths/global.js";
import { readGlobalConfig } from "../../src/state/globalConfig.js";
import { updateParticipant } from "../../src/participants.js";
import { withTempProject } from "../helpers/tempdir.js";

describe("routes /profile", () => {
  it("reads and writes the machine-wide user profile", async () => {
    await withTempProject(async (root) => {
      const configRoot = mkdtempSync(join(tmpdir(), "fmark-profile-cfg-"));
      try {
        const p = paths(root);
        const g = globalPaths(configRoot);
        await initProject(p);
        const { app } = createServer({
          token: null,
          paths: p,
          globalPaths: g,
        });

        const initial = await app.inject({ method: "GET", url: "/profile" });
        expect(initial.statusCode).toBe(200);
        expect(initial.json().profile).toEqual({
          name: "You",
          color: "#3b82f6",
        });

        const updated = await app.inject({
          method: "PATCH",
          url: "/profile",
          payload: {
            name: "Roey",
            color: "#2a5fa8",
            avatar_preset: "02",
          },
        });
        expect(updated.statusCode).toBe(200);
        expect(updated.json().profile).toEqual({
          name: "Roey",
          color: "#2a5fa8",
          avatar_preset: "02",
        });

        await expect(readGlobalConfig(g)).resolves.toMatchObject({
          userProfile: {
            name: "Roey",
            color: "#2a5fa8",
            avatar_preset: "02",
          },
        });
        await app.close();
      } finally {
        rmSync(configRoot, { recursive: true, force: true });
      }
    });
  });

  it("seeds the machine profile from a legacy project-local user profile", async () => {
    await withTempProject(async (root) => {
      const configRoot = mkdtempSync(join(tmpdir(), "fmark-profile-cfg-"));
      try {
        const p = paths(root);
        const g = globalPaths(configRoot);
        await initProject(p);
        const config = await readConfig(p);
        const userId = Object.entries(config.participants).find(
          ([, participant]) => participant.kind === "user",
        )?.[0];
        expect(userId).toBeDefined();
        await updateParticipant(p, userId!, {
          name: "Legacy Roey",
          color: "#8a2a8a",
          avatar_preset: "03",
        });

        const { app } = createServer({
          token: null,
          paths: p,
          globalPaths: g,
        });

        const participants = await app.inject({
          method: "GET",
          url: "/participants",
        });
        expect(participants.statusCode).toBe(200);
        const listedUser = Object.values(
          participants.json().participants as Record<
            string,
            { kind: string; name: string; color: string; avatar_preset?: string }
          >,
        ).find((participant) => participant.kind === "user");
        expect(listedUser).toMatchObject({
          name: "Legacy Roey",
          color: "#8a2a8a",
          avatar_preset: "03",
        });

        const profile = await app.inject({ method: "GET", url: "/profile" });
        expect(profile.statusCode).toBe(200);
        expect(profile.json().profile).toEqual({
          name: "Legacy Roey",
          color: "#8a2a8a",
          avatar_preset: "03",
        });
        await expect(readGlobalConfig(g)).resolves.toMatchObject({
          userProfile: {
            name: "Legacy Roey",
            color: "#8a2a8a",
            avatar_preset: "03",
          },
        });
        await app.close();
      } finally {
        rmSync(configRoot, { recursive: true, force: true });
      }
    });
  });
});
