// packages/kernel/tests/tmux/inputQueue.test.ts
import { describe, expect, it } from "vitest";
import { createInputQueue } from "../../src/tmux/inputQueue.js";

describe("createInputQueue", () => {
  it("serializes operations per pane", async () => {
    const order: string[] = [];
    const q = createInputQueue();
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const a = q.enqueue("pane-1", async () => { await delay(20); order.push("a"); });
    const b = q.enqueue("pane-1", async () => { order.push("b"); });
    const c = q.enqueue("pane-1", async () => { order.push("c"); });
    await Promise.all([a, b, c]);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("does not serialize across panes", async () => {
    const events: string[] = [];
    const q = createInputQueue();
    const a = q.enqueue("p1", async () => { events.push("p1-start"); await new Promise((r) => setTimeout(r, 30)); events.push("p1-end"); });
    const b = q.enqueue("p2", async () => { events.push("p2"); });
    await Promise.all([a, b]);
    expect(events).toEqual(["p1-start", "p2", "p1-end"]);
  });

  it("propagates rejections", async () => {
    const q = createInputQueue();
    await expect(q.enqueue("p", async () => { throw new Error("boom"); })).rejects.toThrow(/boom/);
  });
});
