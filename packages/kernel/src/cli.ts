import * as autoStream from "./hooks/autoStream.js";

export interface CliOptions {
  remote: boolean;
  container: boolean;
  port?: number;
  password?: string;
  /** Absolute path the kernel uses as its initial active path. Overrides
   *  whatever state.json says. Missing → boot with cwd, transitional. */
  path?: string;
  noAuth: boolean;
  allowProcessApiNoAuth: boolean;
  /** Accept hook POSTs from backgrounded paths instead of returning 409
   *  STALE_PATH. Useful when running long-lived agents in multiple paths
   *  simultaneously. Default off; with this flag on, the kernel writes the
   *  event to the path the hook identified (via F_MARK_PATH / body.path)
   *  regardless of the kernel's currently active path. */
  quietCrossPathHooks: boolean;
  help: boolean;
}

function booleanValue(value: string): boolean | null {
  if (value === "true" || value === "1" || value === "") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

function readBooleanAssignment(arg: string, flag: string): boolean | null {
  if (!arg.startsWith(`${flag}=`)) return null;
  const parsed = booleanValue(arg.slice(flag.length + 1));
  if (parsed === null) {
    throw new Error(`${flag} must be true or false`);
  }
  return parsed;
}

function readValueAssignment(arg: string, flag: string): string | null {
  if (!arg.startsWith(`${flag}=`)) return null;
  return arg.slice(flag.length + 1);
}

function parsePortValue(value: string): number {
  const port = Number.parseInt(value, 10);
  if (
    !Number.isInteger(port) ||
    String(port) !== value ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(`--port: invalid port number "${value}"`);
  }
  return port;
}

function parseAuthValue(value: string): boolean {
  const parsed = booleanValue(value);
  if (parsed === null) {
    throw new Error("--auth must be true or false");
  }
  return parsed;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    remote: false,
    container: false,
    noAuth: false,
    allowProcessApiNoAuth: false,
    quietCrossPathHooks: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    const remote = readBooleanAssignment(arg, "--remote");
    if (remote !== null) {
      options.remote = remote;
      continue;
    }
    const container = readBooleanAssignment(arg, "--container");
    if (container !== null) {
      options.container = container;
      continue;
    }
    const noAuth = readBooleanAssignment(arg, "--no-auth");
    if (noAuth !== null) {
      options.noAuth = noAuth;
      continue;
    }
    const allowProcessApiNoAuth = readBooleanAssignment(
      arg,
      "--allow-process-api-no-auth",
    );
    if (allowProcessApiNoAuth !== null) {
      options.allowProcessApiNoAuth = allowProcessApiNoAuth;
      continue;
    }
    const quietCrossPathHooks = readBooleanAssignment(
      arg,
      "--quiet-cross-path-hooks",
    );
    if (quietCrossPathHooks !== null) {
      options.quietCrossPathHooks = quietCrossPathHooks;
      continue;
    }
    const auth = readBooleanAssignment(arg, "--auth");
    if (auth !== null) {
      options.noAuth = !auth;
      continue;
    }
    const assignedPort = readValueAssignment(arg, "--port");
    if (assignedPort !== null) {
      options.port = parsePortValue(assignedPort);
      continue;
    }
    const assignedPassword = readValueAssignment(arg, "--password");
    if (assignedPassword !== null) {
      if (assignedPassword === "") throw new Error("--password requires a value");
      options.password = assignedPassword;
      continue;
    }
    const assignedPath = readValueAssignment(arg, "--path");
    if (assignedPath !== null) {
      if (assignedPath === "" || !assignedPath.startsWith("/")) {
        throw new Error("--path requires an absolute directory");
      }
      options.path = assignedPath;
      continue;
    }

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
      case "--auth": {
        const value = argv[i + 1];
        if (value === undefined || value === "" || value.startsWith("--")) {
          throw new Error("--auth requires true or false");
        }
        options.noAuth = !parseAuthValue(value);
        i++;
        break;
      }
      case "--allow-process-api-no-auth":
        options.allowProcessApiNoAuth = true;
        break;
      case "--quiet-cross-path-hooks":
        options.quietCrossPathHooks = true;
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
        options.port = parsePortValue(value);
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
      case "--path": {
        const value = argv[i + 1];
        if (value === undefined || value === "" || value.startsWith("--")) {
          throw new Error("--path requires an absolute directory");
        }
        if (!value.startsWith("/")) {
          throw new Error(`--path must be absolute: ${value}`);
        }
        options.path = value;
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
       f-mark hook auto-stream [participant_id] [--kind assistant|user]
       f-mark mcp [--path <abs-dir>]

Options:
  --remote            Print SSH port forwarding instructions
  --container         Print container port mapping instructions
  --port <n>          HTTP port (default 7777)
  --path <abs-dir>    Absolute folder to set as the initial active path.
                      Overrides the persisted state.json activePath.
  --password <value>  Use a specific auth token instead of generating one
  --no-auth           Disable auth entirely (prints a warning)
  --auth false        Alias for --no-auth
  --allow-process-api-no-auth
                      Allow the process-spawning API (managed-agents, pane WS)
                      under --no-auth. Off by default — without this flag,
                      --no-auth disables those routes entirely.
  --quiet-cross-path-hooks
                      Accept event POSTs from hooks bound to a backgrounded
                      path (default: 409 STALE_PATH). Use when you want
                      long-lived agents in idle paths to keep posting.
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
    const maybeParticipantId = argv[2];
    const participantId =
      maybeParticipantId !== undefined && !maybeParticipantId.startsWith("--")
        ? maybeParticipantId
        : null;
    const kindFlag = argv.indexOf("--kind");
    const kind = kindFlag >= 0 ? argv[kindFlag + 1] : "assistant";
    if (kind !== "assistant" && kind !== "user") {
      process.stderr.write(`unknown --kind value: ${kind}\n`);
      return 2;
    }
    const stdinRaw = opts.stdin ?? (await readAllStdin());
    return autoStream.runAutoStream(participantId, kind, stdinRaw);
  }

  if (argv[0] === "mcp") {
    let path: string | undefined;
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === "--path") {
        const value = argv[i + 1];
        if (value === undefined || value === "" || value.startsWith("--")) {
          process.stderr.write("--path requires an absolute directory\n");
          return 2;
        }
        if (!value.startsWith("/")) {
          process.stderr.write(`--path must be absolute: ${value}\n`);
          return 2;
        }
        path = value;
        i++;
      } else if (arg === "--help" || arg === "-h") {
        process.stderr.write("Usage: f-mark mcp [--path <abs-dir>]\n");
        return 0;
      } else {
        process.stderr.write(`unknown mcp argument: ${arg}\n`);
        return 2;
      }
    }
    const { runFmarkMcpStdio } = await import("./mcp/stdio.js");
    try {
      await runFmarkMcpStdio({ path });
      return 0;
    } catch (err) {
      process.stderr.write(
        `f-mark mcp failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 1;
    }
  }

  process.stderr.write(`unknown subcommand: ${argv.join(" ")}\n`);
  return 2;
}
