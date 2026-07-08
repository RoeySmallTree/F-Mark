import { describe, it, expect } from "vitest";
import { createServer } from "../src/server.js";
import { initProject } from "../src/project.js";
import { paths } from "../src/paths.js";
import { createSession } from "../src/sessions.js";
import { listParticipants } from "../src/participants.js";
import { withTempProject } from "./helpers/tempdir.js";

describe("security", () => {
  it("rejects session id with .. in events POST", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const [pid] = Object.keys(await listParticipants(p));
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "POST",
        url: "/sessions/..%2Fescape/events/prose",
        payload: { root, participant_id: pid, content: "x"  },
      });
      expect([400, 404]).toContain(res.statusCode);
      await app.close();
    });
  });

  it("rejects participant ids that don't match pattern", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/prose`,
        payload: { root, participant_id: "../etc/passwd", content: "x"  },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("only serves /health without auth when token is set", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: "secret", paths: p });
      const health = await app.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(200);
      expect(health.json().processApiEnabled).toBe(true);
      const sessions = await app.inject({ method: "GET", url: "/sessions" });
      expect(sessions.statusCode).toBe(401);
      await app.close();
    });
  });

  it("/health includes optional non-secret kernel identity", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const kernelIdentity = {
        instance_id: "inst-123",
        pid: 12345,
        config_root: `${root}/config`,
        project_root: root,
        path_id: "abc123def456",
        host: "localhost",
        port: 7777,
        version: "0.4.0",
        started_at: "2026-06-18T11:00:00.000Z",
        dev_supervisor_pid: 54321,
      };
      const { app } = createServer({
        token: "secret",
        paths: p,
        kernelIdentity,
      });
      const health = await app.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toMatchObject({
        status: "ok",
        processApiEnabled: true,
        kernel: kernelIdentity,
      });
      await app.close();
    });
  });

  it("/health reports process-spawning routes enabled under --no-auth (port is trusted)", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({
        token: null,
        paths: p,
        allowProcessApiNoAuth: false,
      });
      const health = await app.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(200);
      expect(health.json().processApiEnabled).toBe(true);
      await app.close();
    });
  });

  it("only enables the dev kernel restart route when the dev supervisor provides a callback", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const disabled = createServer({ token: null, paths: p });
      const disabledHealth = await disabled.app.inject({
        method: "GET",
        url: "/health",
      });
      expect(disabledHealth.json().devKernelRestartEnabled).toBe(false);
      const disabledRestart = await disabled.app.inject({
        method: "POST",
        url: "/dev/restart-kernel",
      });
      expect(disabledRestart.statusCode).toBe(404);
      await disabled.app.close();

      let requested = 0;
      const enabled = createServer({
        token: null,
        paths: p,
        requestKernelRestart: () => {
          requested += 1;
        },
      });
      const enabledHealth = await enabled.app.inject({
        method: "GET",
        url: "/health",
      });
      expect(enabledHealth.json().devKernelRestartEnabled).toBe(true);
      const restart = await enabled.app.inject({
        method: "POST",
        url: "/dev/restart-kernel",
      });
      expect(restart.statusCode).toBe(202);
      expect(restart.json().status).toBe("restarting");
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(requested).toBe(1);
      await enabled.app.close();
    });
  });

  it("allows localhost dev CORS preflight before auth", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: "secret", paths: p });
      const res = await app.inject({
        method: "OPTIONS",
        url: "/runtimes/claude",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "PUT",
          "access-control-request-headers": "content-type, authorization",
        },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe(
        "http://localhost:5173",
      );
      expect(String(res.headers["access-control-allow-methods"])).toContain(
        "PUT",
      );
      await app.close();
    });
  });

  it("supersedes pointing outside the session is accepted on POST (stored as field, not a path op)", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const [pid] = Object.keys(await listParticipants(p));
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${session.id}/events/prose`,
        payload: {
          root,
          participant_id: pid,
          content: "x",
          supersedes: "../../etc/passwd",
        },
      });
      expect(res.statusCode).toBe(200);
      await app.close();
    });
  });

  it("--no-auth trusts the port: /managed-agents/* stays enabled without --allow-process-api-no-auth", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({
        token: null,
        paths: p,
        allowProcessApiNoAuth: false,
      });
      // The route is live under --no-auth, so an unknown runtime yields a 400
      // rather than the old 404 "disabled" response.
      const res = await app.inject({
        method: "POST",
        url: "/managed-agents/spawn",
        payload: { runtime_id: "unknown" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("--no-auth + --allow-process-api-no-auth enables /managed-agents/* routes", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({
        token: null,
        paths: p,
        allowProcessApiNoAuth: true,
      });
      // The route should now exist; we expect a 400 (unknown runtime) rather
      // than a 404 "disabled" response.
      const res = await app.inject({
        method: "POST",
        url: "/managed-agents/spawn",
        payload: { runtime_id: "unknown" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("with token set, --allow-process-api-no-auth is unnecessary and routes work behind bearer", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({
        token: "secret",
        paths: p,
        allowProcessApiNoAuth: false,
      });
      // Without bearer → 401
      const r401 = await app.inject({
        method: "POST",
        url: "/managed-agents/spawn",
        payload: { runtime_id: "unknown" },
      });
      expect(r401.statusCode).toBe(401);
      // With bearer → reaches the route (400 unknown runtime)
      const r400 = await app.inject({
        method: "POST",
        url: "/managed-agents/spawn",
        headers: { authorization: "Bearer secret" },
        payload: { runtime_id: "unknown" },
      });
      expect(r400.statusCode).toBe(400);
      await app.close();
    });
  });
});
