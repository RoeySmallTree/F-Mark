import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerEnvProbeRoute } from "../../src/routes/envProbe.js";

describe("GET /env-probe", () => {
  it("returns tmux + runtimes + installer", async () => {
    const app = Fastify();
    registerEnvProbeRoute(app, {
      probe: async () => ({
        tmux: true,
        tmuxVersion: "3.4",
        runtimes: { claude: true, codex: false, gemini: false },
        installer: "apt",
        os: "linux",
      }),
    });
    const res = await app.inject({ method: "GET", url: "/env-probe" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      tmux: true,
      tmuxVersion: "3.4",
      runtimes: { claude: true, codex: false, gemini: false },
      installer: "apt",
      os: "linux",
    });
    await app.close();
  });

  it("caches result for 30s", async () => {
    let calls = 0;
    const app = Fastify();
    registerEnvProbeRoute(app, {
      probe: async () => {
        calls++;
        return {
          tmux: true,
          tmuxVersion: "3.4",
          runtimes: {},
          installer: null,
          os: "linux",
        };
      },
    });
    await app.inject({ method: "GET", url: "/env-probe" });
    await app.inject({ method: "GET", url: "/env-probe" });
    expect(calls).toBe(1);
    await app.close();
  });
});
