import { describe, expect, it, vi, afterEach } from "vitest";
import { postPing } from "../../src/hooks/post.js";

describe("postPing", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("POSTs to /agents/:id/ping with bearer token, body '{}', and JSON content-type", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      calls.push({ url: url.toString(), init: init ?? {} });
      return new Response(null, { status: 204 });
    });
    await postPing({ kernelUrl: "http://localhost:7777", token: "tok", fmarkDir: "/x" }, "ag-claude");
    expect(calls[0]?.url).toBe("http://localhost:7777/agents/ag-claude/ping");
    const headers = (calls[0]?.init.headers as Record<string, string>);
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(calls[0]?.init.body).toBe("{}");
    expect(calls[0]?.init.signal).toBeDefined();
  });

  it("swallows network errors silently (best-effort)", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    await expect(postPing({ kernelUrl: "http://x", token: "t", fmarkDir: "/x" }, "ag")).resolves.toBeUndefined();
  });

  it("does not throw on non-2xx response", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    await expect(postPing({ kernelUrl: "http://x", token: "t", fmarkDir: "/x" }, "ag")).resolves.toBeUndefined();
  });

  it("resolves within ~3s when fetch never resolves (hung server), via AbortSignal.timeout", async () => {
    // Mock fetch that respects abort signal but never resolves otherwise. This simulates a hung kernel:
    // the connection is accepted but no response ever comes back.
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            // Mirror real fetch behavior: reject with an AbortError-like DOMException
            const err = new DOMException("The operation was aborted.", "AbortError");
            reject(err);
          });
        }
        // Otherwise never resolve.
      });
    });
    const start = Date.now();
    await expect(
      postPing({ kernelUrl: "http://hung", token: "t", fmarkDir: "/x" }, "ag"),
    ).resolves.toBeUndefined();
    const elapsed = Date.now() - start;
    // 2s timeout + slack. Should not block indefinitely.
    expect(elapsed).toBeLessThan(3000);
  }, 5000);
});
