import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { createManagedAgentsClient } from "../../src/api/managedAgents.js";

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

  it("throws on non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const c = createManagedAgentsClient({ baseUrl: "http://x", token: null });
    await expect(c.list()).rejects.toThrow(/500/);
  });
});
