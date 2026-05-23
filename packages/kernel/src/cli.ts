import * as autoStream from "./hooks/autoStream.js";

export interface CliOptions {
  remote: boolean;
  container: boolean;
  port?: number;
  password?: string;
  noAuth: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    remote: false,
    container: false,
    noAuth: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--":
        continue;
      case "--remote":
        options.remote = true;
        break;
      case "--container":
        options.container = true;
        break;
      case "--no-auth":
        options.noAuth = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--port": {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error("--port requires a value");
        }
        const port = Number.parseInt(value, 10);
        if (
          !Number.isInteger(port) ||
          String(port) !== value ||
          port < 1 ||
          port > 65535
        ) {
          throw new Error(`--port: invalid port number "${value}"`);
        }
        options.port = port;
        i++;
        break;
      }
      case "--password": {
        const value = argv[i + 1];
        if (value === undefined || value === "" || value.startsWith("--")) {
          throw new Error("--password requires a value");
        }
        options.password = value;
        i++;
        break;
      }
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (options.remote && options.container) {
    throw new Error("--remote and --container are mutually exclusive");
  }
  if (options.password !== undefined && options.noAuth) {
    throw new Error("--password and --no-auth are mutually exclusive");
  }

  return options;
}

export function printUsage(): void {
  console.log(`Usage: f-mark [options]
       f-mark hook auto-stream <participant_id> [--kind assistant|user]

Options:
  --remote            Print SSH port forwarding instructions
  --container         Print container port mapping instructions
  --port <n>          HTTP port (default 7777)
  --password <value>  Use a specific auth token instead of generating one
  --no-auth           Disable auth entirely (prints a warning)
  --help, -h          Show this help`);
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Dispatch f-mark subcommands. Returns the process exit code.
 *
 * Currently handles the `hook auto-stream` subcommand. For non-subcommand
 * argv (the default `f-mark [options]` server-startup flow), callers should
 * detect that case ahead of time and not call into runCli.
 */
export async function runCli(
  argv: string[],
  opts: { stdin?: string } = {},
): Promise<number> {
  if (argv[0] === "hook" && argv[1] === "auto-stream") {
    const participantId = argv[2];
    if (!participantId || participantId.startsWith("--")) {
      process.stderr.write(
        "usage: f-mark hook auto-stream <participant_id> [--kind assistant|user]\n",
      );
      return 2;
    }
    const kindFlag = argv.indexOf("--kind");
    const kind = kindFlag >= 0 ? argv[kindFlag + 1] : "assistant";
    if (kind !== "assistant" && kind !== "user") {
      process.stderr.write(`unknown --kind value: ${kind}\n`);
      return 2;
    }
    const stdinRaw = opts.stdin ?? (await readAllStdin());
    return autoStream.runAutoStream(participantId, kind, stdinRaw);
  }

  process.stderr.write(`unknown subcommand: ${argv.join(" ")}\n`);
  return 2;
}
