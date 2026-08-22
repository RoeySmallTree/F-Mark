import { describe, it, expect } from "vitest";
import { mintConfirmedIntent } from "./intent";

describe("mintConfirmedIntent", () => {
  it("carries the action identifier", () => {
    expect(mintConfirmedIntent("agent.goodbye").action).toBe("agent.goodbye");
  });
});
