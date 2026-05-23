import type { FastifyInstance } from "fastify";
import { realCommandRunner } from "../tmux/commandRunner.js";

export interface EnvProbeResult {
  tmux: boolean;
  tmuxVersion: string | null;
  runtimes: Record<string, boolean>;
  installer: string | null;
  os: string;
}

export interface ProbeDeps {
  probe(): Promise<EnvProbeResult>;
}

export function realProbe(runtimes: string[]): () => Promise<EnvProbeResult> {
  const runner = realCommandRunner();
  return async () => {
    const which = async (name: string): Promise<boolean> =>
      (await runner.run(["which", name])).exitCode === 0;
    const tmux = await which("tmux");
    let tmuxVersion: string | null = null;
    if (tmux) {
      const r = await runner.run(["tmux", "-V"]);
      const m = /^tmux\s+(\d+\.\d+)/.exec(r.stdout.trim());
      tmuxVersion = m ? m[1]! : null;
    }
    const rt: Record<string, boolean> = {};
    for (const id of runtimes) rt[id] = await which(id);
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
  app.get("/env-probe", async () => {
    if (cached && Date.now() < cached.exp) return cached.result;
    const result = await deps.probe();
    cached = { result, exp: Date.now() + TTL };
    return result;
  });
}
