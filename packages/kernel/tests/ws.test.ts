import { describe, it, expect } from "vitest";
import { createServer } from "../src/server.js";
import { initProject } from "../src/project.js";
import { paths } from "../src/paths.js";
import { createSession } from "../src/sessions.js";
import { listParticipants } from "../src/participants.js";
import { withTempProject } from "./helpers/tempdir.js";
import { WebSocket } from "ws";

describe("websocket /ws", () => {
  it("broadcasts event_added on prose POST", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const [pid] = Object.keys(await listParticipants(p));
      const { app } = createServer({ token: null, paths: p });
      await app.listen({ port: 0, host: "127.0.0.1" });
      const address = app.server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const message = new Promise<unknown>((resolve, reject) => {
        ws.on("message", (data) => resolve(JSON.parse(data.toString())));
        ws.on("error", reject);
      });
      await new Promise<void>((resolve) => ws.once("open", () => resolve()));
      await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/prose`,
        payload: { participant_id: pid, content: "hello" },
      });
      const event = (await message) as {
        type: string;
        session_id: string;
        kind: string;
        participant_id: string;
        filename: string;
      };
      expect(event.type).toBe("event_added");
      expect(event.session_id).toBe(session.id);
      expect(event.kind).toBe("prose");
      ws.close();
      await app.close();
    });
  });
});
