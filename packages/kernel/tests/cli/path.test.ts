import { describe, it, expect } from "vitest";
import { parseArgs } from "../../src/cli.js";

describe("--path", () => {
  it("accepts an absolute path", () => {
    const o = parseArgs(["--path", "/home/me/projects/foo"]);
    expect(o.path).toBe("/home/me/projects/foo");
  });

  it("is undefined when omitted", () => {
    expect(parseArgs([]).path).toBeUndefined();
  });

  it("rejects relative paths", () => {
    expect(() => parseArgs(["--path", "./relative"])).toThrow(/absolute/);
  });

  it("rejects a missing value", () => {
    expect(() => parseArgs(["--path"])).toThrow(/--path/);
  });

  it("rejects an empty value", () => {
    expect(() => parseArgs(["--path", ""])).toThrow(/--path/);
  });

  it("combines with other flags", () => {
    const o = parseArgs([
      "--path",
      "/abs/project",
      "--port",
      "9090",
      "--no-auth",
    ]);
    expect(o.path).toBe("/abs/project");
    expect(o.port).toBe(9090);
    expect(o.noAuth).toBe(true);
  });
});
