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

  it("builds incremental all-session events queries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ groups: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient({ baseUrl: "", token: null });

    await expect(
      client.listAllSessionEvents(["prose"], { incremental: true }),
    ).resolves.toEqual([]);

    const [url] = fetchMock.mock.calls[0]!;
    const parsed = new URL(url as string, "http://x");
    expect(parsed.pathname).toBe("/sessions/events");
    expect(parsed.searchParams.get("scope")).toBe("all");
    expect(parsed.searchParams.get("kinds")).toBe("prose");
    expect(parsed.searchParams.get("incremental")).toBe("1");
  });

  it("builds stateless since all-session events queries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ groups: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient({ baseUrl: "", token: null });

    await client.listAllSessionEvents(undefined, {
      since: "20260618T111500.123Z",
    });

    const [url] = fetchMock.mock.calls[0]!;
    const parsed = new URL(url as string, "http://x");
    expect(parsed.searchParams.get("scope")).toBe("all");
    expect(parsed.searchParams.get("since")).toBe("20260618T111500.123Z");
    expect(parsed.searchParams.has("incremental")).toBe(false);
  });

  it("posts dev kernel restart requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "restarting" }), { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient({ baseUrl: "", token: "secret" });
    await expect(client.restartKernel()).resolves.toEqual({
      status: "restarting",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/dev/restart-kernel",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      }),
    );
  });

  it("threads root scope onto todo list queries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ open: [], wip: [], done: [], tree: [] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient({ baseUrl: "", token: null });

    await client.listTodos("2026-06-24-blocked-multi-tool", {
      pathId: "selected-root-id",
    });

    const [url] = fetchMock.mock.calls[0]!;
    const parsed = new URL(url as string, "http://x");
    expect(parsed.pathname).toBe(
      "/sessions/2026-06-24-blocked-multi-tool/todos",
    );
    expect(parsed.searchParams.get("path_id")).toBe("selected-root-id");
  });

  it("writes scoped file text with path_id and rel_path in the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: "after\n",
          truncated: false,
          size: 6,
          mtimeMs: 42,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient({ baseUrl: "", token: null });

    await expect(
      client.saveFileText({ pathId: "selected-root-id" }, "src/a.ts", "after\n"),
    ).resolves.toMatchObject({ content: "after\n", truncated: false });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/files/text");
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      path_id: "selected-root-id",
      rel_path: "src/a.ts",
      content: "after\n",
    });
  });

  it("keeps todo assigned_to filtering backward-compatible", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ open: [], wip: [], done: [], tree: [] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient({ baseUrl: "", token: null });

    await client.listTodos("s1", "ag-c92e");

    const [url] = fetchMock.mock.calls[0]!;
    const parsed = new URL(url as string, "http://x");
    expect(parsed.pathname).toBe("/sessions/s1/todos");
    expect(parsed.searchParams.get("assigned_to")).toBe("ag-c92e");
  });

  it("patches the machine user profile without participant or root scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          profile: { name: "Roey", color: "#2a5fa8" },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient({ baseUrl: "", token: null });

    await expect(
      client.updateUserProfile({ name: "Roey", color: "#2a5fa8" }),
    ).resolves.toEqual({ name: "Roey", color: "#2a5fa8" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/profile",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Roey", color: "#2a5fa8" }),
      }),
    );
  });

  /* X6 standalone favorites — the file-tree's selected root scope (path_id)
     must be threaded onto every favorites write/read so a favorite added in a
     standalone /file-tree tab persists under the correct root, not the kernel's
     active project. */
  describe("scoped favorites (X6)", () => {
    it("addFilesFavorite puts the scoped path_id in the POST body", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ paths: ["src/a.ts"] }), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const client = createClient({ baseUrl: "", token: null });
      const res = await client.addFilesFavorite({
        scope: "session",
        sessionId: "s1",
        path: "/repo/src/a.ts",
        root: { pathId: "abc123def456" },
      });
      expect(res.paths).toEqual(["src/a.ts"]);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe("/files/favorites");
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.path_id).toBe("abc123def456");
      expect(body.scope).toBe("session");
      expect(body.sessionId).toBe("s1");
      expect(body.path).toBe("/repo/src/a.ts");
    });

    it("removeFilesFavorite puts the scoped path_id in the DELETE query", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ paths: [] }), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const client = createClient({ baseUrl: "", token: null });
      await client.removeFilesFavorite({
        scope: "project",
        path: "/repo/src/a.ts",
        root: { pathId: "abc123def456" },
      });
      const [url] = fetchMock.mock.calls[0]!;
      const parsed = new URL(url as string, "http://x");
      expect(parsed.searchParams.get("path_id")).toBe("abc123def456");
      expect(parsed.searchParams.get("scope")).toBe("project");
    });

    it("fetchFilesFavorites threads the scoped path_id in the GET query", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ paths: [] }), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const client = createClient({ baseUrl: "", token: null });
      await client.fetchFilesFavorites("project", undefined, {
        pathId: "abc123def456",
      });
      const [url] = fetchMock.mock.calls[0]!;
      const parsed = new URL(url as string, "http://x");
      expect(parsed.searchParams.get("path_id")).toBe("abc123def456");
    });

    it("favorites with a `root` scope (no path_id) send root instead", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ paths: [] }), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const client = createClient({ baseUrl: "", token: null });
      await client.addFilesFavorite({
        scope: "project",
        path: "/repo/x.ts",
        root: { root: "/repo" },
      });
      const body = JSON.parse(
        (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
      );
      expect(body.root).toBe("/repo");
      expect(body.path_id).toBeUndefined();
    });
  });
});
