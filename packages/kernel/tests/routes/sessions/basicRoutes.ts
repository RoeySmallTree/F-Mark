import { expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { registerAgent } from "../../../src/participants.js";
import { createAgentStateStore } from "../../../src/services/agentState.js";
import {
  expectSessionDirExists,
  withTempSessionApp,
} from "./helpers.js";

export function registerBasicSessionRouteTests(): void {
  it("POST /sessions creates a session", createsSession);
  it(
    "POST /sessions without a slug uses the new-session placeholder",
    createsPlaceholderSession,
  );
  it("GET /sessions lists sessions", listsSessions);
  it(
    "PATCH /sessions/:id updates the slug and keeps the id immutable",
    renamesSessionSlug,
  );
  it(
    "PATCH /sessions/:id leaves agent bindings untouched (id is stable)",
    renameLeavesAgentBindings,
  );
  it("DELETE /sessions/:id removes only the session folder", deletesSessionFolder);
  it("requires bearer token when configured", requiresBearerToken);
  it("accepts ?token=<token> query param when configured", acceptsTokenQueryParam);
  it("accepts fmark_token cookie on subsequent requests", acceptsTokenCookie);
}

async function createsSession(): Promise<void> {
  await withTempSessionApp(async ({ app }) => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { slug: "demo" },
    });
    expect(res.statusCode).toBe(200);
    const meta = res.json();
    expect(meta.id).toMatch(/-demo$/);
  });
}

async function listsSessions(): Promise<void> {
  await withTempSessionApp(async ({ app }) => {
    await app.inject({ method: "POST", url: "/sessions", payload: { slug: "a" } });
    await app.inject({ method: "POST", url: "/sessions", payload: { slug: "b" } });
    const res = await app.inject({ method: "GET", url: "/sessions" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessions.length).toBe(2);
  });
}

async function renamesSessionSlug(): Promise<void> {
  await withTempSessionApp(async ({ app, root }) => {
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { slug: "before" },
    });
    const id = created.json().id as string;

    const res = await app.inject({
      method: "PATCH",
      url: `/sessions/${id}`,
      payload: { slug: "after" },
    });

    expect(res.statusCode).toBe(200);
    const renamed = res.json();
    expect(renamed.id).toBe(id);
    expect(renamed.slug).toBe("after");
    expectSessionDirExists(root, id, true);

    const listed = await app.inject({ method: "GET", url: "/sessions" });
    const entry = (listed.json().sessions as Array<{ id: string; slug: string }>).find(
      (s) => s.id === id,
    );
    expect(entry?.slug).toBe("after");
  });
}

async function createsPlaceholderSession(): Promise<void> {
  await withTempSessionApp(async ({ app }) => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const meta = res.json();
    expect(meta.slug).toBe("new-session");
    // The id carries no name to outgrow: date + random suffix.
    expect(meta.id).toMatch(/^\d{4}-\d{2}-\d{2}-[0-9a-f]{6}$/);
  });
}

async function renameLeavesAgentBindings(): Promise<void> {
  await withTempSessionApp(async ({ app, p }) => {
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: {},
    });
    const id = created.json().id as string;

    await registerAgent(p, {
      name: "Claude",
      suggested_id: "ag-claude",
      runtime_id: "claude",
      knownRuntimeIds: new Set(["claude"]),
    });
    const agentState = createAgentStateStore({ fallback: p });
    await agentState.writeActiveSession("ag-claude", id);
    await agentState.writeRuntimeSession("ag-claude", {
      desired_name: id,
      native_name_applied: true,
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/sessions/${id}`,
      payload: { slug: "fix-login-flow" },
    });

    expect(res.statusCode).toBe(200);
    const renamed = res.json();
    expect(renamed.id).toBe(id);
    expect(renamed.slug).toBe("fix-login-flow");
    // Nothing to rebind: the id every binding points at is unchanged.
    expect(await agentState.readActiveSession("ag-claude")).toBe(id);
    expect(await agentState.readRuntimeSession("ag-claude")).toEqual(
      expect.objectContaining({ desired_name: id }),
    );
  });
}

async function deletesSessionFolder(): Promise<void> {
  await withTempSessionApp(async ({ app, root }) => {
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { slug: "delete-me" },
    });
    const id = created.json().id as string;

    const res = await app.inject({
      method: "DELETE",
      url: `/sessions/${id}`,
    });

    expect(res.statusCode).toBe(204);
    expectSessionDirExists(root, id, false);
    expect(existsSync(join(root, ".f-mark"))).toBe(true);
  });
}

async function requiresBearerToken(): Promise<void> {
  await withTempSessionApp(async ({ app }) => {
    const res = await app.inject({ method: "GET", url: "/sessions" });
    expect(res.statusCode).toBe(401);
    const ok = await app.inject({
      method: "GET",
      url: "/sessions",
      headers: { authorization: "Bearer secret" },
    });
    expect(ok.statusCode).toBe(200);
  }, { token: "secret" });
}

async function acceptsTokenQueryParam(): Promise<void> {
  await withTempSessionApp(async ({ app }) => {
    const ok = await app.inject({
      method: "GET",
      url: "/sessions?token=secret",
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["set-cookie"]).toMatch(/fmark_token=secret/);
    const bad = await app.inject({
      method: "GET",
      url: "/sessions?token=wrong",
    });
    expect(bad.statusCode).toBe(401);
  }, { token: "secret" });
}

async function acceptsTokenCookie(): Promise<void> {
  await withTempSessionApp(async ({ app }) => {
    const ok = await app.inject({
      method: "GET",
      url: "/sessions",
      headers: { cookie: "fmark_token=secret" },
    });
    expect(ok.statusCode).toBe(200);
    const bad = await app.inject({
      method: "GET",
      url: "/sessions",
      headers: { cookie: "fmark_token=wrong" },
    });
    expect(bad.statusCode).toBe(401);
  }, { token: "secret" });
}
