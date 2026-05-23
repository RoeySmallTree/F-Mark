import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerPresenceRoutes } from "../../src/routes/presence.js";
import { createPresenceTracker } from "../../src/presence/tracker.js";

describe("POST /agents/:id/ping", () => {
  it("204s and bumps the tracker", async () => {
    const broadcasts: unknown[] = [];
    const tracker = createPresenceTracker({ broadcast: (m) => broadcasts.push(m) });
    const app = Fastify();
    registerPresenceRoutes(app, () => tracker);
    const res = await app.inject({ method: "POST", url: "/agents/ag-claude/ping", payload: {} });
    expect(res.statusCode).toBe(204);
    expect(tracker.snapshot().get("ag-claude")?.state).toBe("online");
    await app.close();
  });

  it("400 on invalid participant id", async () => {
    const app = Fastify();
    registerPresenceRoutes(app, () => createPresenceTracker({ broadcast: () => {} }));
    const res = await app.inject({ method: "POST", url: "/agents/BAD_ID/ping", payload: {} });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
