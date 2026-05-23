import { describe, expect, it } from "vitest";
import { createPaneHub } from "../../src/ws/paneHub.js";

describe("PaneHub", () => {
  it("starts pipe on first subscriber, stops on last unsubscribe", async () => {
    const starts: string[] = [];
    const stops: string[] = [];
    const hub = createPaneHub({
      onStart: (id) => starts.push(id),
      onStop: (id) => stops.push(id),
    });
    const a = hub.subscribe("p1", () => {});
    expect(starts).toEqual(["p1"]);
    const b = hub.subscribe("p1", () => {});
    expect(starts).toEqual(["p1"]); // not started again
    a.unsubscribe();
    expect(stops).toEqual([]);
    b.unsubscribe();
    expect(stops).toEqual(["p1"]);
  });

  it("dispatches data to all subscribers", () => {
    const hub = createPaneHub({ onStart: () => {}, onStop: () => {} });
    const got: string[][] = [[], []];
    hub.subscribe("p", (d) => got[0]!.push(d));
    hub.subscribe("p", (d) => got[1]!.push(d));
    hub.feed("p", "hello");
    hub.feed("p", "world");
    expect(got[0]).toEqual(["hello", "world"]);
    expect(got[1]).toEqual(["hello", "world"]);
  });

  it("isolates panes from each other", () => {
    const hub = createPaneHub({ onStart: () => {}, onStop: () => {} });
    let got1 = ""; let got2 = "";
    hub.subscribe("p1", (d) => { got1 += d; });
    hub.subscribe("p2", (d) => { got2 += d; });
    hub.feed("p1", "A");
    hub.feed("p2", "B");
    expect(got1).toBe("A");
    expect(got2).toBe("B");
  });

  it("feed before any subscriber is a no-op", () => {
    const hub = createPaneHub({ onStart: () => {}, onStop: () => {} });
    expect(() => hub.feed("nobody", "lost data")).not.toThrow();
  });

  it("multiple unsubscribes of the same handle are idempotent", () => {
    const stops: string[] = [];
    const hub = createPaneHub({ onStart: () => {}, onStop: (id) => stops.push(id) });
    const sub = hub.subscribe("p", () => {});
    sub.unsubscribe();
    sub.unsubscribe();
    expect(stops).toEqual(["p"]);
  });
});
