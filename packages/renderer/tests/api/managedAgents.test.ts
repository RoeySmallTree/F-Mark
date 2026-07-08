import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import {
  createManagedAgentsClient,
  isProcessApiDisabledError,
} from "../../src/api/managedAgents.js";

describe("ManagedAgentsClient", () => {
  let fetchSpy: MockInstance<typeof fetch>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response('{"agents":[],"terminals":[]}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("list calls GET /managed-agents", async () => {
    const c = createManagedAgentsClient({ baseUrl: "http://x:7777", token: "tok" });
    const r = await c.list();
    expect(r).toEqual({ agents: [], terminals: [] });
    const callArgs = fetchSpy.mock.calls[0]!;
    expect(callArgs[0]).toBe("http://x:7777/managed-agents");
    expect((callArgs[1] as { method: string }).method).toBe("GET");
    expect(
      (callArgs[1] as { headers: Record<string, string> }).headers.Authorization,
    ).toBe("Bearer tok");
  });

  it("spawn POSTs body and parses JSON", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        '{"participant_id":"ag-1","tmux_session":"s","runtime_id":"claude"}',
        { status: 200 },
      ),
    );
    const c = createManagedAgentsClient({ baseUrl: "http://x", token: null });
    const r = await c.spawn({ runtime_id: "claude" });
    expect(r.participant_id).toBe("ag-1");
  });

  it("command POSTs the body", async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const c = createManagedAgentsClient({ baseUrl: "http://x", token: null });
    await c.command("ag-1", { type: "interrupt" });
    const call = fetchSpy.mock.calls[0]!;
    expect(call[0]).toBe("http://x/managed-agents/ag-1/command");
    expect((call[1] as { body: string }).body).toBe('{"type":"interrupt"}');
  });

  it("command merges the root scope (path_id) into the body", async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const c = createManagedAgentsClient({ baseUrl: "http://x", token: null });
    await c.command("ag-1", { type: "interrupt" }, { pathId: "bg123" });
    const call = fetchSpy.mock.calls[0]!;
    expect(JSON.parse((call[1] as { body: string }).body)).toEqual({
      type: "interrupt",
      path_id: "bg123",
    });
  });

  it("pause sends the root scope (root) as the POST body", async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"agent":{}}', { status: 200 }));
    const c = createManagedAgentsClient({ baseUrl: "http://x", token: null });
    await c.pause("ag-1", { root: "/home/roey/p" });
    const call = fetchSpy.mock.calls[0]!;
    expect(call[0]).toBe("http://x/managed-agents/ag-1/pause");
    expect(JSON.parse((call[1] as { body: string }).body)).toEqual({
      root: "/home/roey/p",
    });
  });

  it("goodbye appends the root scope to the DELETE query", async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const c = createManagedAgentsClient({ baseUrl: "http://x", token: null });
    await c.goodbye("ag-1", "tok-123", { pathId: "bg123" });
    const call = fetchSpy.mock.calls[0]!;
    expect(String(call[0])).toContain("/managed-agents/ag-1?");
    expect(String(call[0])).toContain("confirm=tok-123");
    expect(String(call[0])).toContain("path_id=bg123");
    expect((call[1] as { method: string }).method).toBe("DELETE");
  });

  it("status appends session_id and the root scope to the query", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('{"agents":[],"terminals":[]}', { status: 200 }),
    );
    const c = createManagedAgentsClient({ baseUrl: "http://x", token: null });
    await c.status("sess-1", { pathId: "bg123" });
    const call = fetchSpy.mock.calls[0]!;
    expect(String(call[0])).toContain("/managed-agents/status?");
    expect(String(call[0])).toContain("session_id=sess-1");
    expect(String(call[0])).toContain("path_id=bg123");
  });

  it("runtimeCatalogModels calls the runtime catalog with refresh and defaults", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        '{"models":[{"id":"opus","displayName":"Opus"}],"default_model":"opus","default_effort":"high","default_access_mode":"plan"}',
        { status: 200 },
      ),
    );
    const c = createManagedAgentsClient({ baseUrl: "http://x", token: null });
    const catalog = await c.runtimeCatalogModels("claude", { refresh: true });
    const call = fetchSpy.mock.calls[0]!;
    expect(call[0]).toBe("http://x/runtimes/claude/models?refresh=1");
    expect(catalog.default_model).toBe("opus");
    expect(catalog.default_effort).toBe("high");
    expect(catalog.default_access_mode).toBe("plan");
  });

  it("runtimeCatalogEfforts calls the runtime catalog with model", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        '{"efforts":[{"id":"high","displayName":"High"}]}',
        { status: 200 },
      ),
    );
    const c = createManagedAgentsClient({ baseUrl: "http://x", token: null });
    const efforts = await c.runtimeCatalogEfforts("claude", "opus");
    const call = fetchSpy.mock.calls[0]!;
    expect(call[0]).toBe("http://x/runtimes/claude/efforts?model=opus");
    expect(efforts).toEqual([{ id: "high", displayName: "High" }]);
  });

  it("runtime registry methods call /runtimes endpoints", async () => {
    fetchSpy.mockImplementation(
      async () =>
        new Response(
          '{"version":"1.0","runtimes":{"mybot":{"displayName":"My Bot","executable":"mybot","args":[]}}}',
          { status: 200 },
        ),
    );
    const c = createManagedAgentsClient({ baseUrl: "http://x", token: null });
    await c.listRuntimes();
    await c.upsertRuntime("mybot", {
      displayName: "My Bot",
      executable: "mybot",
      args: [],
    });
    await c.removeRuntime("mybot");

    expect(fetchSpy.mock.calls[0]![0]).toBe("http://x/runtimes");
    expect((fetchSpy.mock.calls[0]![1] as { method: string }).method).toBe(
      "GET",
    );
    expect(fetchSpy.mock.calls[1]![0]).toBe("http://x/runtimes/mybot");
    expect((fetchSpy.mock.calls[1]![1] as { method: string }).method).toBe(
      "PUT",
    );
    expect((fetchSpy.mock.calls[1]![1] as { body: string }).body).toContain(
      '"executable":"mybot"',
    );
    expect(fetchSpy.mock.calls[2]![0]).toBe("http://x/runtimes/mybot");
    expect((fetchSpy.mock.calls[2]![1] as { method: string }).method).toBe(
      "DELETE",
    );
  });

  it("retries localhost kernel directly when same-origin returns app HTML", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response("<!doctype html><html><body>app</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '{"version":"1.0","runtimes":{"mybot":{"displayName":"My Bot","executable":"mybot","args":[]}}}',
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    const c = createManagedAgentsClient({ baseUrl: "", token: null });
    const r = await c.upsertRuntime("mybot", {
      displayName: "My Bot",
      executable: "mybot",
      args: [],
    });

    expect(r.runtimes.mybot?.executable).toBe("mybot");
    expect(fetchSpy.mock.calls[0]![0]).toBe("/runtimes/mybot");
    const fallbackHost =
      window.location.hostname === "::1"
        ? "[::1]"
        : window.location.hostname;
    expect(fetchSpy.mock.calls[1]![0]).toBe(
      `${window.location.protocol}//${fallbackHost}:7777/runtimes/mybot`,
    );
  });

  it("throws on non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const c = createManagedAgentsClient({ baseUrl: "http://x", token: null });
    await expect(c.list()).rejects.toThrow(/500/);
  });

  it("recognizes the process API disabled response", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error:
            "process-spawning API disabled. Pass --allow-process-api-no-auth to enable under --no-auth.",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );
    const c = createManagedAgentsClient({ baseUrl: "http://x", token: null });
    let err: unknown = null;
    try {
      await c.list();
    } catch (e) {
      err = e;
    }
    expect(isProcessApiDisabledError(err)).toBe(true);
  });
});
