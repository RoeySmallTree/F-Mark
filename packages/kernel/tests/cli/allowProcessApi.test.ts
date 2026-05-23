import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli.js";

describe("--allow-process-api-no-auth", () => {
  it("parses the flag together with --no-auth", () => {
    const o = parseArgs(["--no-auth", "--allow-process-api-no-auth"]);
    expect(o.noAuth).toBe(true);
    expect(o.allowProcessApiNoAuth).toBe(true);
  });

  it("parses the flag on its own (does not imply --no-auth)", () => {
    const o = parseArgs(["--allow-process-api-no-auth"]);
    expect(o.noAuth).toBe(false);
    expect(o.allowProcessApiNoAuth).toBe(true);
  });

  it("defaults to false", () => {
    expect(parseArgs([]).allowProcessApiNoAuth).toBe(false);
  });
});
