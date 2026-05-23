import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerManagedAgentsRoutes } from "../../src/routes/managedAgents.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createPresenceTracker } from "../../src/presence/tracker.js";
import { createInputQueue } from "../../src/tmux/inputQueue.js";
import type { TmuxManager } from "../../src/tmux/manager.js";

function fakeTmux(): TmuxManager {
  return {
    spawnAgent: async () => ({ sessionName: "fake-session" }),
    spawnTerminal: async () => ({ sessionName: "fake-term" }),
    listFmarkSessions: async () => [],
    killSession: async () => {},
    captureSnapshot: async () => "",
    startPipePane: async () => {},
    stopPipePane: async () => {},
    sendLiteralText: async () => {},
    sendKey: async () => {},
    resize: async () => {},
    paneAlive: async () => true,
    getVersion: async () => null,
    getUserOption: async () => null,
  };
}

async function makeApp() {
  const root = await mkdtemp(join(tmpdir(), "fmark-origin-"));
  const p = paths(root);
  await initProject(p);
  const tmux = fakeTmux();
  const tracker = createPresenceTracker({ broadcast: () => {} });
  const app = Fastify();
  registerManagedAgentsRoutes(app, {
    paths: p,
    tmux,
    tracker,
    projectRoot: root,
    inputQueue: createInputQueue(),
    bus: { publish: () => {} },
  });
  return {
    app,
    cleanup: async () => {
      await app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

describe("managed-agents Origin/Host validation", () => {
  it("403s when cookie-auth without Origin header on mutating route", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/managed-agents/terminal",
        headers: { cookie: "fmark_token=tok" },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toMatch(/Origin/);
    } finally {
      await cleanup();
    }
  });

  it("403s when cookie-auth with non-localhost Origin", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/managed-agents/terminal",
        headers: { cookie: "fmark_token=tok", origin: "http://evil.example" },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toMatch(/Origin/);
    } finally {
      await cleanup();
    }
  });

  it("passes mutating route when bearer-auth (Authorization header) regardless of Origin", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/managed-agents/terminal",
        headers: { authorization: "Bearer tok", origin: "http://evil.example" },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await cleanup();
    }
  });

  it("passes mutating route when cookie-auth with localhost Origin", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/managed-agents/terminal",
        headers: { cookie: "fmark_token=tok", origin: "http://localhost:7777" },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await cleanup();
    }
  });

  it("passes mutating route when cookie-auth with 127.0.0.1 Origin", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/managed-agents/terminal",
        headers: { cookie: "fmark_token=tok", origin: "http://127.0.0.1:7777" },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await cleanup();
    }
  });

  it("passes mutating route when cookie-auth with Origin matching request Host", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/managed-agents/terminal",
        headers: {
          cookie: "fmark_token=tok",
          origin: "http://example.local:7777",
          host: "example.local:7777",
        },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await cleanup();
    }
  });

  it("403s on invalid Origin URL with cookie-auth", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/managed-agents/terminal",
        headers: { cookie: "fmark_token=tok", origin: "not-a-valid-url" },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await cleanup();
    }
  });

  it("skips GET requests entirely (read-only routes are unaffected)", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.inject({
        method: "GET",
        url: "/managed-agents",
        headers: { cookie: "fmark_token=tok", origin: "http://evil.example" },
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await cleanup();
    }
  });

  it("DELETE is also gated: 403 when cookie-auth without Origin", async () => {
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.inject({
        method: "DELETE",
        url: "/managed-agents/ag-claude?confirm=xyz",
        headers: { cookie: "fmark_token=tok" },
      });
      expect(res.statusCode).toBe(403);
      // The route itself would otherwise return 403 for stale confirm,
      // but the Origin check should fire first with the Origin error.
      expect(res.json().error).toMatch(/Origin/);
    } finally {
      await cleanup();
    }
  });

  it("does not affect non-managed-agents URLs", async () => {
    // We register only managed-agents in makeApp, so we have nothing else to
    // probe; this is a behavioural assertion that the hook scopes itself by
    // URL prefix. We hit a wrong path on the same app and expect a normal
    // 404 (no Origin gate triggered).
    const { app, cleanup } = await makeApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: "/somewhere-else",
        headers: { cookie: "fmark_token=tok" },
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await cleanup();
    }
  });
});
