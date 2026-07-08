import { spawn } from "node:child_process";
import { unlink, rmdir } from "node:fs/promises";

export async function mkfifo(path: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const command = spawn("mkfifo", [path]);
    command.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`mkfifo exit ${code}`)),
    );
    command.on("error", (error) => reject(error));
  });
}

export async function bestEffortUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // already gone
  }
}

export async function bestEffortRmdir(path: string): Promise<void> {
  try {
    await rmdir(path);
  } catch {
    // already gone
  }
}
