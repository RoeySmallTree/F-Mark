import { existsSync } from "node:fs";
import process from "node:process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* `managed-only-v2` adds the `PostToolUse` Claude hook for live
   tool-use streaming. v1 installations show as "stale" until the user
   re-applies; the Apply path is idempotent. */
export const FMARK_HOOK_INSTALL_VERSION = "managed-only-v2";
const VERSION_FLAG = "--fmark-hook-version";

function localTsxCommand(packageRoot: string): string {
  const binName = process.platform === "win32" ? "tsx.cmd" : "tsx";
  const local = join(packageRoot, "node_modules", ".bin", binName);
  return existsSync(local) ? local : "tsx";
}

function shellQuote(value: string): string {
  if (/^[a-zA-Z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function autoStreamBaseArgv(): string[] {
  const moduleFile = fileURLToPath(import.meta.url);
  const buildDir = dirname(dirname(moduleFile));
  const packageRoot = dirname(buildDir);
  if (basename(buildDir) === "src") {
    const entrypoint = join(packageRoot, "src", "index.ts");
    return [localTsxCommand(packageRoot), entrypoint, "hook", "auto-stream"];
  }
  if (basename(buildDir) === "dist") {
    const entrypoint = join(packageRoot, "dist", "index.js");
    return [process.execPath, entrypoint, "hook", "auto-stream"];
  }
  return ["f-mark", "hook", "auto-stream"];
}

export function autoStreamHookCommand(opts: {
  participantId?: string;
  kind?: "assistant" | "user";
} = {}): string {
  const argv = autoStreamBaseArgv();
  if (opts.participantId !== undefined) argv.push(opts.participantId);
  if (opts.kind !== undefined && opts.kind !== "assistant") {
    argv.push("--kind", opts.kind);
  }
  argv.push(VERSION_FLAG, FMARK_HOOK_INSTALL_VERSION);
  return argv.map(shellQuote).join(" ");
}

export function isFmarkAutoStreamCommand(command: string): boolean {
  return command.includes("hook") && command.includes("auto-stream");
}

export function autoStreamHookVersion(command: string): string | null {
  const flag = command.match(
    /(?:^|\s)--fmark-hook-version(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/,
  );
  return flag?.[1] ?? flag?.[2] ?? flag?.[3] ?? null;
}
