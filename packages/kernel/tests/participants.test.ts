import { describe, it, expect } from "vitest";
import { initProject } from "../src/project.js";
import { paths } from "../src/paths.js";
import {
  listParticipants,
  registerAgent,
  updateParticipant,
} from "../src/participants.js";
import { writeActiveSession } from "../src/agents/activeSession.js";
import { withTempProject } from "./helpers/tempdir.js";

describe("participants", () => {
  it("listParticipants returns the default user", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const list = await listParticipants(p);
      const ids = Object.keys(list);
      expect(ids).toHaveLength(1);
      expect(ids[0]).toMatch(/^us-/);
    });
  });

  it("registerAgent assigns an ag- id and persists", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const created = await registerAgent(p, { name: "Claude" });
      expect(created.id).toMatch(/^ag-[0-9a-f]{4}$/);
      expect(created.name).toBe("Claude");
      expect(created.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      const list = await listParticipants(p);
      expect(list[created.id]).toEqual({
        kind: "agent",
        name: "Claude",
        color: created.color,
        active_session: null,
      });
    });
  });

  it("listParticipants enriches each agent with active_session from disk", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const bound = await registerAgent(p, { name: "Bound" });
      const unbound = await registerAgent(p, { name: "Unbound" });
      const { join } = await import("node:path");
      await writeActiveSession(join(p.fmarkDir(), "agents"), bound.id, "2026-05-24-active");

      const list = await listParticipants(p);
      expect(list[bound.id]?.active_session).toBe("2026-05-24-active");
      expect(list[unbound.id]?.active_session).toBeNull();
      // Users always get null — they are not session-bound.
      const userId = Object.entries(list).find(
        ([, v]) => v.kind === "user",
      )?.[0];
      expect(userId).toBeDefined();
      expect(list[userId!]?.active_session).toBeNull();
    });
  });

  it("registerAgent honors suggested_id if free", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const created = await registerAgent(p, { name: "Claude", suggested_id: "ag-claude" });
      expect(created.id).toBe("ag-claude");
    });
  });

  it("registerAgent rejects a suggested_id that collides", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      await registerAgent(p, { name: "Claude", suggested_id: "ag-claude" });
      await expect(
        registerAgent(p, { name: "Another", suggested_id: "ag-claude" }),
      ).rejects.toThrow(/already registered/);
    });
  });

  it("registerAgent rejects invalid id formats", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      await expect(
        registerAgent(p, { name: "x", suggested_id: "agent-x" }),
      ).rejects.toThrow(/format/);
    });
  });

  it("updateParticipant persists a user avatar data URL", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const list = await listParticipants(p);
      const userId = Object.entries(list).find(
        ([, v]) => v.kind === "user",
      )![0];
      const avatar = "data:image/png;base64,aGVsbG8=";

      const updated = await updateParticipant(p, userId, {
        avatar_data_url: avatar,
      });
      expect(updated.avatar_data_url).toBe(avatar);

      const refetched = await listParticipants(p);
      expect(refetched[userId]?.avatar_data_url).toBe(avatar);
    });
  });

  it("updateParticipant rejects avatar images for agents", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const agent = await registerAgent(p, { name: "Claude" });
      await expect(
        updateParticipant(p, agent.id, {
          avatar_data_url: "data:image/png;base64,aGVsbG8=",
        }),
      ).rejects.toThrow(/only supported for user/);
    });
  });
});
