import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import {
  registerEnvProbeRoute,
  realProbe,
  type EnvProbeResult,
} from "../../src/routes/envProbe.js";
import { fakeCommandRunner } from "../../src/tmux/commandRunner.js";

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

describe("POST /env-probe/refresh", () => {
  it("busts the cache and re-runs the probe", async () => {
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
    // Prime the cache.
    await app.inject({ method: "GET", url: "/env-probe" });
    expect(calls).toBe(1);
    // GET should still hit the cache.
    await app.inject({ method: "GET", url: "/env-probe" });
    expect(calls).toBe(1);
    // POST /refresh re-runs the probe.
    const res = await app.inject({ method: "POST", url: "/env-probe/refresh" });
    expect(res.statusCode).toBe(200);
    expect(calls).toBe(2);
    // Subsequent GET should use the new cached result, not re-run.
    await app.inject({ method: "GET", url: "/env-probe" });
    expect(calls).toBe(2);
    await app.close();
  });

  it("returns the freshly-probed result", async () => {
    let calls = 0;
    const app = Fastify();
    registerEnvProbeRoute(app, {
      probe: async () => {
        calls++;
        return {
          tmux: true,
          tmuxVersion: `3.${calls}`,
          runtimes: {},
          installer: null,
          os: "linux",
        };
      },
    });
    const res = await app.inject({ method: "POST", url: "/env-probe/refresh" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      tmux: true,
      tmuxVersion: "3.1",
      runtimes: {},
      installer: null,
      os: "linux",
    });
    await app.close();
  });

  it("broadcasts env-probe.updated over the bus when broadcast is wired", async () => {
    const published: Array<{ type: string; result: EnvProbeResult }> = [];
    const app = Fastify();
    registerEnvProbeRoute(app, {
      probe: async () => ({
        tmux: true,
        tmuxVersion: "3.4",
        runtimes: { claude: true },
        installer: "apt",
        os: "linux",
      }),
      broadcast: (m) => {
        published.push(m);
      },
    });
    await app.inject({ method: "POST", url: "/env-probe/refresh" });
    expect(published).toHaveLength(1);
    expect(published[0]).toEqual({
      type: "env-probe.updated",
      result: {
        tmux: true,
        tmuxVersion: "3.4",
        runtimes: { claude: true },
        installer: "apt",
        os: "linux",
      },
    });
    await app.close();
  });
});

describe("realProbe()", () => {
  it("runs `which tmux` and parses `tmux -V`", async () => {
    const runner = fakeCommandRunner();
    runner.expect(["which", "tmux"], { stdout: "/usr/bin/tmux\n", stderr: "", exitCode: 0 });
    runner.expect(["tmux", "-V"], { stdout: "tmux 3.4\n", stderr: "", exitCode: 0 });
    // No runtimes — empty list.
    runner.expect(["which", "brew"], { stdout: "", stderr: "", exitCode: 1 });
    runner.expect(["which", "apt"], { stdout: "/usr/bin/apt\n", stderr: "", exitCode: 0 });

    const probe = realProbe(async () => [], runner);
    const result = await probe();
    expect(result.tmux).toBe(true);
    expect(result.tmuxVersion).toBe("3.4");
    expect(result.installer).toBe("apt");
    expect(result.runtimes).toEqual({});
    runner.verifyExpectationsConsumed();
  });

  it("returns tmuxVersion: null when `tmux -V` exits non-zero", async () => {
    const runner = fakeCommandRunner();
    runner.expect(["which", "tmux"], { stdout: "/usr/bin/tmux\n", stderr: "", exitCode: 0 });
    runner.expect(["tmux", "-V"], { stdout: "", stderr: "boom", exitCode: 1 });
    // installer probes
    runner.expect(["which", "brew"], { stdout: "", stderr: "", exitCode: 1 });
    runner.expect(["which", "apt"], { stdout: "", stderr: "", exitCode: 1 });
    runner.expect(["which", "dnf"], { stdout: "", stderr: "", exitCode: 1 });
    runner.expect(["which", "yum"], { stdout: "", stderr: "", exitCode: 1 });
    runner.expect(["which", "zypper"], { stdout: "", stderr: "", exitCode: 1 });
    runner.expect(["which", "port"], { stdout: "", stderr: "", exitCode: 1 });
    runner.expect(["which", "pacman"], { stdout: "", stderr: "", exitCode: 1 });

    const probe = realProbe(async () => [], runner);
    const result = await probe();
    expect(result.tmux).toBe(true);
    expect(result.tmuxVersion).toBeNull();
    expect(result.installer).toBeNull();
    runner.verifyExpectationsConsumed();
  });

  it("probes each runtime's executable (not its id)", async () => {
    const runner = fakeCommandRunner();
    runner.expect(["which", "tmux"], { stdout: "/usr/bin/tmux\n", stderr: "", exitCode: 0 });
    runner.expect(["tmux", "-V"], { stdout: "tmux 3.4\n", stderr: "", exitCode: 0 });
    // The runtime id is "mylocal" but executable is "/usr/local/bin/my".
    runner.expect(["which", "/usr/local/bin/my"], { stdout: "/usr/local/bin/my\n", stderr: "", exitCode: 0 });
    // The runtime id is "claude" with executable "claude".
    runner.expect(["which", "claude"], { stdout: "/usr/bin/claude\n", stderr: "", exitCode: 0 });
    runner.expect(["which", "brew"], { stdout: "/opt/homebrew/bin/brew\n", stderr: "", exitCode: 0 });

    const probe = realProbe(
      async () => [
        { id: "mylocal", executable: "/usr/local/bin/my" },
        { id: "claude", executable: "claude" },
      ],
      runner,
    );
    const result = await probe();
    expect(result.runtimes).toEqual({ mylocal: true, claude: true });
    expect(result.installer).toBe("brew");
    runner.verifyExpectationsConsumed();
  });

  it("returns runtime: false when its executable is missing on PATH", async () => {
    const runner = fakeCommandRunner();
    runner.expect(["which", "tmux"], { stdout: "/usr/bin/tmux\n", stderr: "", exitCode: 0 });
    runner.expect(["tmux", "-V"], { stdout: "tmux 3.4\n", stderr: "", exitCode: 0 });
    runner.expect(["which", "missing-exec"], { stdout: "", stderr: "", exitCode: 1 });
    runner.expect(["which", "brew"], { stdout: "", stderr: "", exitCode: 1 });
    runner.expect(["which", "apt"], { stdout: "/usr/bin/apt\n", stderr: "", exitCode: 0 });

    const probe = realProbe(
      async () => [{ id: "ghost", executable: "missing-exec" }],
      runner,
    );
    const result = await probe();
    expect(result.runtimes).toEqual({ ghost: false });
    runner.verifyExpectationsConsumed();
  });

  it("returns tmux: false and skips `tmux -V` when tmux is not on PATH", async () => {
    const runner = fakeCommandRunner();
    runner.expect(["which", "tmux"], { stdout: "", stderr: "", exitCode: 1 });
    runner.expect(["which", "brew"], { stdout: "/opt/homebrew/bin/brew\n", stderr: "", exitCode: 0 });

    const probe = realProbe(async () => [], runner);
    const result = await probe();
    expect(result.tmux).toBe(false);
    expect(result.tmuxVersion).toBeNull();
    expect(result.installer).toBe("brew");
    runner.verifyExpectationsConsumed();
  });

  it("returns installer priority brew before apt", async () => {
    const runner = fakeCommandRunner();
    runner.expect(["which", "tmux"], { stdout: "", stderr: "", exitCode: 1 });
    // Both brew and apt available, but brew is probed first and short-circuits.
    runner.expect(["which", "brew"], { stdout: "/opt/homebrew/bin/brew\n", stderr: "", exitCode: 0 });

    const probe = realProbe(async () => [], runner);
    const result = await probe();
    expect(result.installer).toBe("brew");
    runner.verifyExpectationsConsumed();
  });
});
