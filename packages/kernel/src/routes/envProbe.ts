import type { FastifyInstance } from "fastify";
import { executableExistsOnDisk } from "../runtimes/executableSearch.js";
import { realCommandRunner, type CommandRunner } from "../tmux/commandRunner.js";

export interface EnvProbeResult {
  tmux: boolean;
  tmuxVersion: string | null;
  runtimes: Record<string, boolean>;
  installer: string | null;
  os: string;
}

/** One runtime entry to probe: id keyed in the result, executable resolved via `which`. */
export interface RuntimeProbeEntry {
  id: string;
  executable: string;
}

export interface ProbeDeps {
  probe(): Promise<EnvProbeResult>;
  /** Optional bus publisher. When wired, POST /env-probe/refresh broadcasts env-probe.updated. */
  broadcast?: (msg: { type: "env-probe.updated"; result: EnvProbeResult }) => void;
}

/**
 * Build a probe function that introspects the local environment via `which`.
 *
 * The runtime list is supplied by `getRuntimes` so the registered runtime
 * catalog (`.f-mark/runtimes.json`) drives detection — each entry is probed by
 * its configured `executable`, not by its id.
 *
 * `runner` is injectable so tests can feed canned `which`/`tmux -V` output via
 * `fakeCommandRunner()` without spawning subprocesses.
 */
export function realProbe(
  getRuntimes: () => Promise<RuntimeProbeEntry[]>,
  runner: CommandRunner = realCommandRunner(),
): () => Promise<EnvProbeResult> {
  return async () => {
    const which = async (name: string): Promise<boolean> =>
      (await runner.run(["which", name])).exitCode === 0;
    const runtimeAvailable = async (name: string): Promise<boolean> =>
      (await runner.run(["which", name])).exitCode === 0 ||
      (await executableExistsOnDisk(name, process.env));
    const tmux = await which("tmux");
    let tmuxVersion: string | null = null;
    if (tmux) {
      const r = await runner.run(["tmux", "-V"]);
      if (r.exitCode === 0) {
        const m = /^tmux\s+(\d+\.\d+)/.exec(r.stdout.trim());
        tmuxVersion = m ? m[1]! : null;
      }
    }
    const runtimes = await getRuntimes();
    const rt: Record<string, boolean> = {};
    for (const { id, executable } of runtimes) {
      rt[id] = await runtimeAvailable(executable);
    }
    const installers = [
      "brew",
      "apt",
      "dnf",
      "yum",
      "zypper",
      "port",
      "pacman",
    ] as const;
    let installer: string | null = null;
    for (const inst of installers) {
      if (await which(inst)) {
        installer = inst;
        break;
      }
    }
    return { tmux, tmuxVersion, runtimes: rt, installer, os: process.platform };
  };
}

export function registerEnvProbeRoute(
  app: FastifyInstance,
  deps: ProbeDeps,
): void {
  let cached: { result: EnvProbeResult; exp: number } | null = null;
  const TTL = 30_000;

  async function fresh(): Promise<EnvProbeResult> {
    const result = await deps.probe();
    cached = { result, exp: Date.now() + TTL };
    if (deps.broadcast) deps.broadcast({ type: "env-probe.updated", result });
    return result;
  }

  app.get("/env-probe", async () => {
    if (cached && Date.now() < cached.exp) return cached.result;
    return fresh();
  });

  app.post("/env-probe/refresh", async () => fresh());
}
