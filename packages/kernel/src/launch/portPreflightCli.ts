import process from "node:process";
import { pathToFileURL } from "node:url";
import { DEFAULT_PORT, HOST } from "../config.js";
import * as logger from "../logger.js";
import { parseCliPortValue } from "../cli/port.js";
import {
  ensurePortAvailableForLaunch,
  type PortLaunchLogger,
} from "./portCleanup.js";

interface PortPreflightArgs {
  port: number;
  host: string;
  help: boolean;
}

function readRequiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value === "" || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parsePortPreflightArgs(argv: string[]): PortPreflightArgs {
  const parsed: PortPreflightArgs = {
    port: DEFAULT_PORT,
    host: HOST,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--port") {
      parsed.port = parseCliPortValue(readRequiredValue(argv, i, arg));
      i++;
      continue;
    }
    if (arg.startsWith("--port=")) {
      parsed.port = parseCliPortValue(arg.slice("--port=".length));
      continue;
    }
    if (arg === "--host") {
      parsed.host = readRequiredValue(argv, i, arg);
      i++;
      continue;
    }
    if (arg.startsWith("--host=")) {
      const host = arg.slice("--host=".length);
      if (host === "") throw new Error("--host requires a value");
      parsed.host = host;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

function usage(): string {
  return "Usage: portPreflightCli --host <host> --port <n>\n";
}

export async function runPortPreflightCli(
  argv: string[],
  opts: {
    ensurePortAvailable?: typeof ensurePortAvailableForLaunch;
    stderr?: Pick<NodeJS.WriteStream, "write">;
    stdout?: Pick<NodeJS.WriteStream, "write">;
    logger?: PortLaunchLogger;
  } = {},
): Promise<number> {
  const stderr = opts.stderr ?? process.stderr;
  const stdout = opts.stdout ?? process.stdout;

  let parsed: PortPreflightArgs;
  try {
    parsed = parsePortPreflightArgs(argv);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stderr.write(`Error: ${msg}\n${usage()}`);
    return 2;
  }

  if (parsed.help) {
    stdout.write(usage());
    return 0;
  }

  try {
    await (opts.ensurePortAvailable ?? ensurePortAvailableForLaunch)({
      port: parsed.port,
      host: parsed.host,
      logger: opts.logger ?? logger,
    });
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stderr.write(`Port preflight failed: ${msg}\n`);
    return 1;
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const code = await runPortPreflightCli(process.argv.slice(2));
  process.exit(code);
}
