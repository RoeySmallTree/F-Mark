import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { postPing } from "../../src/hooks/post.js";

describe("postPing", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("POSTs to /agents/:id/ping with bearer token", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      calls.push({ url: url.toString(), init: init ?? {} });
      return new Response(null, { status: 204 });
    });
    await postPing({ kernelUrl: "http://localhost:7777", token: "tok", fmarkDir: "/x" }, "ag-claude");
    expect(calls[0]?.url).toBe("http://localhost:7777/agents/ag-claude/ping");
    const headers = (calls[0]?.init.headers as Record<string, string>);
    expect(headers.Authorization).toBe("Bearer tok");
  });

  it("swallows network errors silently (best-effort)", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    await expect(postPing({ kernelUrl: "http://x", token: "t", fmarkDir: "/x" }, "ag")).resolves.toBeUndefined();
  });

  it("does not throw on non-2xx response", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    await expect(postPing({ kernelUrl: "http://x", token: "t", fmarkDir: "/x" }, "ag")).resolves.toBeUndefined();
  });
});
