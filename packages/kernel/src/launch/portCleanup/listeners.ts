import { execFile } from "node:child_process";
import { createServer } from "node:net";
import type { CommandResult } from "./types.js";
import { parsePidList, uniquePids } from "./pids.js";

type CommandRunner = (
  command: string,
  args: string[],
) => Promise<CommandResult>;

function commandResult(
  command: string,
  args: string[],
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? ""),
        error: error instanceof Error ? error : null,
      });
    });
  });
}

export async function discoverListenerPids(
  port: number,
  _host: string,
  runCommand: CommandRunner = commandResult,
): Promise<number[]> {
  const lsof = await runCommand("lsof", [
    "-nP",
    `-tiTCP:${port}`,
    "-sTCP:LISTEN",
  ]);
  const lsofPids = parsePidList(lsof.stdout);
  if (lsofPids.length > 0) return uniquePids(lsofPids);

  const fuser = await runCommand("fuser", ["-n", "tcp", String(port)]);
  return uniquePids(parsePidList(fuser.stdout));
}

export async function isTcpPortListening(
  port: number,
  host: string,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", (err) => {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "EADDRINUSE"
      ) {
        resolve(true);
        return;
      }
      reject(err);
    });
    server.once("listening", () => {
      server.close((err) => {
        if (err !== undefined) reject(err);
        else resolve(false);
      });
    });
    server.listen({ port, host });
  });
}
