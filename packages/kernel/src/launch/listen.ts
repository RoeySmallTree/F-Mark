import type { FastifyInstance } from "fastify";
import {
  discoverListenerPids,
  formatListenerPids,
} from "./portCleanup.js";

export class PinnedPortInUseError extends Error {
  readonly port: number;
  readonly host: string;
  readonly pids: number[];

  constructor(options: { port: number; host: string; pids: number[] }) {
    super(
      `Port ${options.port} on ${options.host} is still in use after cleanup; refusing to auto-increment. Detected listener PIDs: ${formatListenerPids(options.pids)}. Stop that process or pass --port <n>.`,
    );
    this.name = "PinnedPortInUseError";
    this.port = options.port;
    this.host = options.host;
    this.pids = options.pids;
  }
}

function hasErrnoCode(err: unknown, code: string): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === code
  );
}

export async function listenOnPinnedPort(
  app: Pick<FastifyInstance, "listen">,
  options: { port: number; host: string },
  deps: {
    findListenerPids?: (port: number, host: string) => Promise<number[]>;
  } = {},
): Promise<void> {
  try {
    await app.listen({ port: options.port, host: options.host });
  } catch (err) {
    if (!hasErrnoCode(err, "EADDRINUSE")) throw err;
    let pids: number[] = [];
    try {
      pids = await (deps.findListenerPids ?? discoverListenerPids)(
        options.port,
        options.host,
      );
    } catch {
      pids = [];
    }
    throw new PinnedPortInUseError({
      port: options.port,
      host: options.host,
      pids,
    });
  }
}
