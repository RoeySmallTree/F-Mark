import { describe, expect, it } from "vitest";
import { renderBanner } from "../src/banner.js";

describe("renderBanner — --allow-process-api-no-auth warning", () => {
  const base = {
    mode: "local" as const,
    port: 7777,
    hostname: "host",
    user: "u",
    sshHint: false,
  };

  it("emits a warning when token is null AND allowProcessApiNoAuth is true", () => {
    const out = renderBanner({
      ...base,
      token: null,
      allowProcessApiNoAuth: true,
    });
    expect(out).toMatch(
      /WARNING: --no-auth \+ --allow-process-api-no-auth allows ANY client on this port to spawn processes\./,
    );
  });

  it("does not warn when token is set (auth is on)", () => {
    const out = renderBanner({
      ...base,
      token: "secret",
      allowProcessApiNoAuth: true,
    });
    expect(out).not.toMatch(/WARNING:/);
  });

  it("does not warn when allowProcessApiNoAuth is false", () => {
    const out = renderBanner({ ...base, token: null, allowProcessApiNoAuth: false });
    expect(out).not.toMatch(/WARNING:/);
  });

  it("does not warn when allowProcessApiNoAuth is omitted", () => {
    const out = renderBanner({ ...base, token: null });
    expect(out).not.toMatch(/WARNING:/);
  });

  it("warning also fires for remote + container modes", () => {
    for (const mode of ["remote", "container"] as const) {
      const out = renderBanner({
        ...base,
        mode,
        token: null,
        allowProcessApiNoAuth: true,
      });
      expect(out).toMatch(/WARNING: --no-auth \+ --allow-process-api-no-auth/);
    }
  });
});
