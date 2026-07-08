import { describe, it, expect } from "vitest";
import { serializeProse, parseProse } from "../../src/events/prose.js";
import type { ProsePayload } from "@f-mark/shared";

describe("prose supersedes serialization", () => {
  it("round-trips a supersedes array (coalesced message)", () => {
    const payload = {
      content: "Hello world",
      arbitrary: false,
      supersedes: ["20260625T1Z_ag.prose.md", "20260625T2Z_ag.prose.md"],
    } as unknown as ProsePayload;
    const round = parseProse(serializeProse(payload));
    expect(round.supersedes).toEqual([
      "20260625T1Z_ag.prose.md",
      "20260625T2Z_ag.prose.md",
    ]);
    expect(round.content.trim()).toBe("Hello world");
  });

  it("round-trips a scalar supersedes (revision)", () => {
    const payload = {
      content: "v2",
      supersedes: "20260625T1Z_ag.prose.md",
    } as unknown as ProsePayload;
    expect(parseProse(serializeProse(payload)).supersedes).toBe(
      "20260625T1Z_ag.prose.md",
    );
  });

  it("drops an empty supersedes array", () => {
    const payload = {
      content: "x",
      supersedes: [],
    } as unknown as ProsePayload;
    expect(parseProse(serializeProse(payload)).supersedes).toBeUndefined();
  });
});
