import { describe, it, expect } from "vitest";
import { createServer } from "../src/server.js";
import { initProject } from "../src/project.js";
import { paths } from "../src/paths.js";
import { withTempProject } from "./helpers/tempdir.js";

describe("e2e turn", () => {
  it("runs a complete user → agent → user turn flow", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });

      const created = await app.inject({
        method: "POST",
        url: "/sessions",
        payload: { slug: "e2e" },
      });
      const session = created.json() as { id: string };

      const participants = (
        await app.inject({ method: "GET", url: "/participants" })
      ).json() as { participants: Record<string, unknown> };
      const userId = Object.keys(participants.participants)[0]!;

      const agent = (
        await app.inject({
          method: "POST",
          url: "/participants/register",
          payload: {
            kind: "agent",
            name: "Claude",
            suggested_id: "ag-claude",
          },
        })
      ).json() as { id: string };

      const u1 = await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/prose`,
        payload: { participant_id: userId, content: "Plan a launch." },
      });
      expect(u1.statusCode).toBe(200);

      const ute = await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/turn-end`,
        payload: { participant_id: userId },
      });
      expect(ute.statusCode).toBe(200);

      const a1 = await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/prose`,
        payload: {
          participant_id: agent.id,
          content: "# Launch Plan\n\nPhase 1: ...",
          name: "Launch Plan v1",
        },
      });
      const named = a1.json() as { filename: string };
      expect(named.filename).toMatch(/\.prose\.md$/);

      const choices = await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/choices`,
        payload: {
          participant_id: agent.id,
          id: "ch_approach",
          question: "Approach?",
          options: [
            { id: "a", label: "Incremental" },
            { id: "b", label: "Rewrite" },
          ],
          multi: false,
        },
      });
      expect(choices.statusCode).toBe(200);

      await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/turn-end`,
        payload: { participant_id: agent.id },
      });

      const choice = await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/choice`,
        payload: {
          participant_id: userId,
          choices_id: "ch_approach",
          selected: ["b"],
        },
      });
      expect(choice.statusCode).toBe(200);

      const comment = await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/prose`,
        payload: {
          participant_id: userId,
          content: "Refine phase 1.",
          target: { file: named.filename },
        },
      });
      expect(comment.statusCode).toBe(200);

      const revision = await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/prose`,
        payload: {
          participant_id: agent.id,
          content: "# Launch Plan\n\nPhase 1: refined ...",
          name: "Launch Plan v1",
          supersedes: named.filename,
        },
      });
      expect(revision.statusCode).toBe(200);

      const events = (
        await app.inject({
          method: "GET",
          url: `/sessions/${session.id}/events`,
        })
      ).json() as { events: { kind: string; filename: string }[] };
      const kinds = events.events.map((e) => e.kind);
      expect(kinds).toContain("prose");
      expect(kinds).toContain("choices");
      expect(kinds).toContain("choice");
      expect(kinds).toContain("turn-end");
      expect(events.events.length).toBeGreaterThanOrEqual(8);

      await app.close();
    });
  });
});
