import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli.js";

describe("kernel CLI flags", () => {
  it("leaves the default port owned by startup", () => {
    expect(parseArgs([]).port).toBeUndefined();
  });

  it("parses the full dev flag set", () => {
    const options = parseArgs([
      "--remote",
      "--port",
      "9090",
      "--path",
      "/abs/project",
      "--password",
      "secret",
      "--allow-process-api-no-auth",
      "--quiet-cross-path-hooks",
    ]);

    expect(options).toMatchObject({
      remote: true,
      container: false,
      port: 9090,
      path: "/abs/project",
      password: "secret",
      noAuth: false,
      allowProcessApiNoAuth: true,
      quietCrossPathHooks: true,
    });
  });

  it("parses container and no-auth flags together", () => {
    const options = parseArgs([
      "--container",
      "--no-auth",
      "--allow-process-api-no-auth",
    ]);

    expect(options.container).toBe(true);
    expect(options.noAuth).toBe(true);
    expect(options.allowProcessApiNoAuth).toBe(true);
  });

  it("parses equals-style values and booleans", () => {
    const options = parseArgs([
      "--remote=true",
      "--container=false",
      "--port=9090",
      "--path=/abs/project",
      "--password=secret",
      "--allow-process-api-no-auth=true",
      "--quiet-cross-path-hooks=true",
    ]);

    expect(options).toMatchObject({
      remote: true,
      container: false,
      port: 9090,
      path: "/abs/project",
      password: "secret",
      noAuth: false,
      allowProcessApiNoAuth: true,
      quietCrossPathHooks: true,
    });
  });

  it("parses auth aliases", () => {
    expect(parseArgs(["--auth=false"]).noAuth).toBe(true);
    expect(parseArgs(["--auth", "false"]).noAuth).toBe(true);
    expect(parseArgs(["--auth=true"]).noAuth).toBe(false);
    expect(parseArgs(["--auth", "true"]).noAuth).toBe(false);
  });

  it("rejects mutually exclusive mode/auth combinations", () => {
    expect(() => parseArgs(["--remote", "--container"])).toThrow(
      /mutually exclusive/,
    );
    expect(() => parseArgs(["--password", "secret", "--no-auth"])).toThrow(
      /mutually exclusive/,
    );
  });

  it("rejects invalid auth values", () => {
    expect(() => parseArgs(["--auth=maybe"])).toThrow(
      /--auth must be true or false/,
    );
    expect(() => parseArgs(["--auth"])).toThrow(
      /--auth requires true or false/,
    );
  });
});
