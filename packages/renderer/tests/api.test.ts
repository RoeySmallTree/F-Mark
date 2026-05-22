import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "../src/api/client.js";

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("appends bearer token header when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sessions: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient({ baseUrl: "", token: "secret" });
    await client.listSessions();
    expect(fetchMock).toHaveBeenCalledWith(
      "/sessions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      }),
    );
  });

  it("posts JSON bodies and parses response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "2026-05-22-x" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient({ baseUrl: "", token: null });
    const meta = await client.createSession({ slug: "x" });
    expect(meta.id).toBe("2026-05-22-x");
    expect(fetchMock).toHaveBeenCalledWith(
      "/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ slug: "x" }),
      }),
    );
  });

  it("throws on non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "nope" }), { status: 400 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient({ baseUrl: "", token: null });
    await expect(client.listSessions()).rejects.toThrow(/nope/);
  });
});
