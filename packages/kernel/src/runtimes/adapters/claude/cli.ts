import { spawn } from "child_process";
import type { ClaudeCliRunner } from "./types.js";

export function defaultRunCli(binary: string): ClaudeCliRunner {
  return (args) =>
    new Promise((resolve) => {
      const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("close", (code) =>
        resolve({ stdout, stderr, code: code ?? 0 }),
      );
      child.on("error", () => resolve({ stdout, stderr, code: 1 }));
    });
}
