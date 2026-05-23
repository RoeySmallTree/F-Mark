import { describe, it, expect, beforeEach, vi } from "vitest";
import { postProjectedEvents } from "../../src/hooks/post.js";
import type { ProjectedEvent } from "../../src/hooks/projectTurn.js";

describe("postProjectedEvents", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
  });

  const ctx = {
    fmarkDir: "/tmp/fm/.f-mark",
    kernelUrl: "http://localhost:7777",
    token: "tok",
  };

  it("posts each projected event in order, then turn-end", async () => {
    const events: ProjectedEvent[] = [
      { kind: "prose", content: "I'll search.", arbitrary: true },
      { kind: "tool-use", tool_name: "Bash", tool_use_id: "tu_1", input: { command: "ls" }, result: "a", success: true },
      { kind: "prose", content: "Done.", arbitrary: false },
    ];
    await postProjectedEvents(ctx, "ag-claude", "sess-1", events);

    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(4); // 3 events + turn-end
    expect(f.mock.calls[0][0]).toBe("http://localhost:7777/sessions/sess-1/events/prose");
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({
      participant_id: "ag-claude",
      content: "I'll search.",
      arbitrary: true,
    });
    expect(f.mock.calls[1][0]).toBe("http://localhost:7777/sessions/sess-1/events/tool-use");
    expect(JSON.parse(f.mock.calls[1][1].body)).toMatchObject({
      tool_name: "Bash",
      tool_use_id: "tu_1",
      success: true,
    });
    expect(f.mock.calls[2][0]).toBe("http://localhost:7777/sessions/sess-1/events/prose");
    expect(JSON.parse(f.mock.calls[2][1].body)).toMatchObject({
      content: "Done.",
      arbitrary: false,
    });
    expect(f.mock.calls[3][0]).toBe("http://localhost:7777/sessions/sess-1/events/turn-end");
  });

  it("skips turn-end when there is no concluding prose (turn ended on tool-use)", async () => {
    const events: ProjectedEvent[] = [
      { kind: "tool-use", tool_name: "Bash", tool_use_id: "x", input: {}, result: "", success: true },
    ];
    await postProjectedEvents(ctx, "ag-claude", "sess-1", events);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).not.toContain("turn-end");
  });

  it("sets Authorization: Bearer", async () => {
    await postProjectedEvents(ctx, "ag-claude", "sess-1", [
      { kind: "prose", content: "hi", arbitrary: false },
    ]);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("throws on non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    await expect(
      postProjectedEvents(ctx, "ag-claude", "sess-1", [
        { kind: "prose", content: "x", arbitrary: false },
      ]),
    ).rejects.toThrow(/401/);
  });

  it("suppresses turn-end when emitTurnEnd: false", async () => {
    await postProjectedEvents(
      ctx,
      "us-roey",
      "sess-1",
      [{ kind: "prose", content: "hi", arbitrary: false }],
      { emitTurnEnd: false },
    );
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).not.toContain("turn-end");
  });
});
