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

  it("hookInstallStatus serializes query params", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        '{"installed":false,"configPath":"x","detectedEntries":[],"expectedEntries":[]}',
        { status: 200 },
      ),
    );
    const c = createManagedAgentsClient({ baseUrl: "http://x", token: null });
    await c.hookInstallStatus({ runtime_id: "claude", participant_id: "ag-1" });
    const call = fetchSpy.mock.calls[0]!;
    expect(String(call[0])).toContain("runtime_id=claude");
    expect(String(call[0])).toContain("participant_id=ag-1");
  });

  it("hookInstallApply POSTs scope and identifiers", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        '{"applied":true,"scope":"local","configPath":"/repo/.claude/settings.json","status":{"installed":true,"configPath":"/repo/.claude/settings.json","detectedEntries":[],"expectedEntries":[]}}',
        { status: 200 },
      ),
    );
    const c = createManagedAgentsClient({ baseUrl: "http://x", token: null });
    await c.hookInstallApply({
      runtime_id: "claude",
      participant_id: "ag-1",
      user_participant_id: "us-1",
      scope: "local",
    });
    const call = fetchSpy.mock.calls[0]!;
    expect(String(call[0])).toContain(
      "/managed-agents/hook-install-apply?",
    );
    expect(String(call[0])).toContain("runtime_id=claude");
    expect(String(call[0])).toContain("participant_id=ag-1");
    expect(String(call[0])).toContain("user_participant_id=us-1");
    expect((call[1] as { method: string }).method).toBe("POST");
    expect((call[1] as { body: string }).body).toBe('{"scope":"local"}');
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
