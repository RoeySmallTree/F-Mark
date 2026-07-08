import { describe, it, expect } from "vitest";
import {
  ACTIVE_SESSION_ID,
  AVATAR_PRESET_ID,
  MACHINE_USER_PROFILE,
  expectParticipantNamed,
  expectStatus,
  expectUserProfileOverlay,
  getParticipantsMap,
  getUserId,
  patchParticipant,
  patchUserParticipant,
  registerParticipant,
  responseJson,
  withFreshActivePathParticipantsApp,
  withOtherActivePathParticipantsApp,
  withParticipantsApp,
  withProfileParticipantsApp,
  withRegisteredOtherPathParticipantsApp,
  writeAgentActiveSession,
} from "./participants/harness.js";

describe("routes /participants", () => {
  it("GET /participants returns config participants", async () => {
    await withParticipantsApp(async ({ app }) => {
      const participants = await getParticipantsMap(app);
      expect(Object.keys(participants).length).toBe(1);
    });
  });

  it("GET /participants overlays the machine user profile", async () => {
    await withProfileParticipantsApp(MACHINE_USER_PROFILE, async ({ app }) => {
      const participants = await getParticipantsMap(app);
      expectUserProfileOverlay(participants, MACHINE_USER_PROFILE);
    });
  });

  it("POST /participants/register creates an agent", async () => {
    await withParticipantsApp(async ({ app }) => {
      const res = await registerParticipant(app, {
        kind: "agent",
        name: "Claude",
      });
      expectStatus(res, 200);
      const body = responseJson<{ id: string }>(res);
      expect(body.id).toMatch(/^ag-/);
    });
  });

  it("POST /participants/register rejects bad payload", async () => {
    await withParticipantsApp(async ({ app }) => {
      const res = await registerParticipant(app, { kind: "user" });
      expectStatus(res, 400);
    });
  });

  it("PATCH /participants/:id updates name + color and persists", async () => {
    await withParticipantsApp(async ({ app }) => {
      const userId = await getUserId(app);
      const res = await patchParticipant(app, userId, {
        name: "Roey",
        color: "#2a5fa8",
      });
      expectStatus(res, 200);
      const body = responseJson<{ color: string; id: string; name: string }>(
        res,
      );
      expect(body.id).toBe(userId);
      expect(body.name).toBe("Roey");
      expect(body.color).toBe("#2a5fa8");

      const after = await getParticipantsMap(app);
      expect(after[userId]!.name).toBe("Roey");
      expect(after[userId]!.color).toBe("#2a5fa8");
    });
  });

  it("PATCH /participants/:id updates and removes a user avatar preset", async () => {
    await withParticipantsApp(async ({ app }) => {
      const userId = await getUserId(app);
      const updated = await patchParticipant(app, userId, {
        avatar_preset: AVATAR_PRESET_ID,
      });
      expectStatus(updated, 200);
      expect(responseJson<{ avatar_preset?: string }>(updated).avatar_preset)
        .toBe(AVATAR_PRESET_ID);

      const refetched = await getParticipantsMap(app);
      expect(refetched[userId]!.avatar_preset).toBe(AVATAR_PRESET_ID);

      const removed = await patchParticipant(app, userId, {
        avatar_preset: null,
      });
      expectStatus(removed, 200);
      expect(
        responseJson<{ avatar_preset?: string }>(removed).avatar_preset,
      ).toBeUndefined();

      const afterRemove = await getParticipantsMap(app);
      expect(afterRemove[userId]!.avatar_preset).toBeUndefined();
    });
  });

  it("PATCH /participants/:id 404 on unknown id", async () => {
    await withParticipantsApp(async ({ app }) => {
      const res = await patchParticipant(app, "us-ffff", { name: "X" });
      expectStatus(res, 404);
    });
  });

  it("PATCH /participants/:id rejects bad color", async () => {
    await withParticipantsApp(async ({ app }) => {
      const res = await patchUserParticipant(app, { color: "not-a-color" });
      expectStatus(res, 400);
    });
  });

  it("PATCH /participants/:id rejects invalid avatar presets", async () => {
    await withParticipantsApp(async ({ app }) => {
      const res = await patchUserParticipant(app, {
        avatar_preset: "999",
      });
      expectStatus(res, 400);
    });
  });

  describe("multi-path scoping", () => {
    it("returns empty when the active path has no .f-mark/ yet", async () => {
      await withFreshActivePathParticipantsApp(async ({ app }) => {
        const participants = await getParticipantsMap(app);
        expect(participants).toEqual({});
      });
    });

    it("reads participants from the active path, not the fallback", async () => {
      await withOtherActivePathParticipantsApp(async ({ app, ref }) => {
        await registerParticipant(app, {
          kind: "agent",
          name: "OtherAgent",
        });

        const list = await getParticipantsMap(app);
        expectParticipantNamed(list, "OtherAgent", true);

        ref.setActive(null);
        const list2 = await getParticipantsMap(app);
        expectParticipantNamed(list2, "OtherAgent", false);
      });
    });

    it("reads participants from an explicit path_id scope", async () => {
      await withRegisteredOtherPathParticipantsApp(
        async ({ app, fallbackPathId, otherPathId }) => {
          await registerParticipant(
            app,
            { kind: "agent", name: "ScopedAgent" },
            otherPathId,
          );

          const list = await getParticipantsMap(app, otherPathId);
          expectParticipantNamed(list, "ScopedAgent", true);

          const fallbackList = await getParticipantsMap(app, fallbackPathId);
          expectParticipantNamed(fallbackList, "ScopedAgent", false);
        },
      );
    });

    it("enriches active-path participants from global agent state", async () => {
      await withOtherActivePathParticipantsApp(async (context) => {
        const { app } = context;
        await registerParticipant(app, {
          kind: "agent",
          name: "GlobalAgent",
          suggested_id: "ag-global",
        });
        await writeAgentActiveSession(
          context,
          "ag-global",
          ACTIVE_SESSION_ID,
        );

        const list = await getParticipantsMap(app);
        expect(list["ag-global"]?.active_session).toBe(ACTIVE_SESSION_ID);
      });
    });
  });
});
