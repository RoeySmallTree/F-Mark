import { describe, it, expect } from "vitest";
import { createServer } from "../src/server.js";
import { initProject } from "../src/project.js";
import { paths } from "../src/paths.js";
import { createSession } from "../src/sessions.js";
import { listParticipants } from "../src/participants.js";
import { withTempProject } from "./helpers/tempdir.js";
import { WebSocket } from "ws";

describe("websocket /ws", () => {
  it("broadcasts event_added exactly once on prose POST", async () => {
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
      const messages: { type: string; kind?: string; session_id?: string }[] =
        [];
      ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
      await new Promise<void>((resolve) => ws.once("open", () => resolve()));
      await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/prose`,
        payload: { participant_id: pid, content: "hello" },
      });
      // Collect for a window long enough that any stray duplicate publisher
      // (e.g. the legacy chokidar watcher) would have surfaced.
      await new Promise((r) => setTimeout(r, 300));
      const added = messages.filter((m) => m.type === "event_added");
      expect(added).toHaveLength(1);
      expect(added[0].session_id).toBe(session.id);
      expect(added[0].kind).toBe("prose");
      ws.close();
      await app.close();
    });
  });

  it("broadcasts presence message published via the bus", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app, getBus } = createServer({ token: null, paths: p });
      await app.listen({ port: 0, host: "127.0.0.1" });
      const address = app.server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const message = new Promise<unknown>((resolve, reject) => {
        ws.on("message", (data) => resolve(JSON.parse(data.toString())));
        ws.on("error", reject);
      });
      await new Promise<void>((resolve) => ws.once("open", () => resolve()));
      getBus().publish({
        type: "presence",
        participant_id: "ag-claude",
        state: "online",
        last_hook_at: 12345,
      });
      const event = (await message) as {
        type: string;
        participant_id: string;
        state: string;
        last_hook_at: number | null;
      };
      expect(event.type).toBe("presence");
      expect(event.participant_id).toBe("ag-claude");
      expect(event.state).toBe("online");
      expect(event.last_hook_at).toBe(12345);
      ws.close();
      await app.close();
    });
  });
});
