import { parseCliPortValue } from "./port.js";

export interface CliOptions {
  remote: boolean;
  container: boolean;
  port?: number;
  password?: string;
  /** Absolute path the kernel uses as its initial active path. Overrides
   *  whatever state.json says. Missing -> boot with cwd, transitional. */
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

type BooleanFlagHandler = (value: boolean) => void;
type ValueFlagHandler = (value: string) => void;

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

function parseAuthValue(value: string): boolean {
  const parsed = booleanValue(value);
  if (parsed === null) {
    throw new Error("--auth must be true or false");
  }
  return parsed;
}

export function parseArgs(argv: string[]): CliOptions {
  return new CliArgumentParser(argv).parse();
}

class CliArgumentParser {
  private index = 0;
  private options: CliOptions = {
    remote: false,
    container: false,
    noAuth: false,
    allowProcessApiNoAuth: false,
    quietCrossPathHooks: false,
    help: false,
  };

  constructor(private readonly argv: string[]) {}

  parse(): CliOptions {
    for (this.index = 0; this.index < this.argv.length; this.index++) {
      this.parseOne(this.argv[this.index]!);
    }
    this.validate();
    return this.options;
  }

  private parseOne(arg: string): void {
    if (this.parseBooleanAssignment(arg)) return;
    if (this.parseValueAssignment(arg)) return;
    this.parseFlag(arg);
  }

  private booleanFlagHandlers(): Record<string, BooleanFlagHandler> {
    return {
      "--remote": (value) => { this.options.remote = value; },
      "--container": (value) => { this.options.container = value; },
      "--no-auth": (value) => { this.options.noAuth = value; },
      "--allow-process-api-no-auth": (value) => {
        this.options.allowProcessApiNoAuth = value;
      },
      "--quiet-cross-path-hooks": (value) => {
        this.options.quietCrossPathHooks = value;
      },
      "--auth": (value) => { this.options.noAuth = !value; },
    };
  }

  private valueFlagHandlers(): Record<string, ValueFlagHandler> {
    return {
      "--port": (value) => { this.options.port = parseCliPortValue(value); },
      "--password": (value) => {
        this.options.password = this.parseAssignedPassword(value);
      },
      "--path": (value) => {
        this.options.path = this.parseAssignedPath(value);
      },
    };
  }

  private bareFlagHandlers(): Record<string, () => void> {
    return {
      "--remote": () => { this.options.remote = true; },
      "--container": () => { this.options.container = true; },
      "--no-auth": () => { this.options.noAuth = true; },
      "--allow-process-api-no-auth": () => {
        this.options.allowProcessApiNoAuth = true;
      },
      "--quiet-cross-path-hooks": () => {
        this.options.quietCrossPathHooks = true;
      },
      "--help": () => { this.options.help = true; },
      "-h": () => { this.options.help = true; },
    };
  }

  private parseBooleanAssignment(arg: string): boolean {
    for (const [flag, apply] of Object.entries(this.booleanFlagHandlers())) {
      const value = readBooleanAssignment(arg, flag);
      if (value === null) continue;
      apply(value);
      return true;
    }
    return false;
  }

  private parseValueAssignment(arg: string): boolean {
    for (const [flag, apply] of Object.entries(this.valueFlagHandlers())) {
      const value = readValueAssignment(arg, flag);
      if (value === null) continue;
      apply(value);
      return true;
    }
    return false;
  }

  private parseFlag(arg: string): void {
    if (arg === "--") return;
    if (this.applyBareFlag(arg)) return;
    if (this.applyValueFlag(arg)) return;
    throw new Error(`unknown argument: ${arg}`);
  }

  private applyBareFlag(arg: string): boolean {
    const handler = this.bareFlagHandlers()[arg];
    if (handler === undefined) return false;
    handler();
    return true;
  }

  private applyValueFlag(arg: string): boolean {
    const handlers: Record<string, () => void> = {
      "--auth": () => {
        this.options.noAuth = !parseAuthValue(
          this.consumeValue("--auth", "true or false"),
        );
      },
      "--port": () => {
        this.options.port = parseCliPortValue(
          this.consumeValue("--port", "a value"),
        );
      },
      "--password": () => {
        this.options.password = this.consumeValue("--password", "a value");
      },
      "--path": () => {
        this.options.path = this.parsePathValue(
          this.consumeValue("--path", "an absolute directory"),
        );
      },
    };
    const handler = handlers[arg];
    if (handler === undefined) return false;
    handler();
    return true;
  }

  private parseAssignedPassword(value: string): string {
    if (value === "") throw new Error("--password requires a value");
    return value;
  }

  private parseAssignedPath(value: string): string {
    if (value === "" || !value.startsWith("/")) {
      throw new Error("--path requires an absolute directory");
    }
    return value;
  }

  private parsePathValue(value: string): string {
    if (!value.startsWith("/")) {
      throw new Error(`--path must be absolute: ${value}`);
    }
    return value;
  }

  private consumeValue(flag: string, requirement: string): string {
    const value = this.argv[this.index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new Error(`${flag} requires ${requirement}`);
    }
    this.index++;
    return value;
  }

  private validate(): void {
    if (this.options.remote && this.options.container) {
      throw new Error("--remote and --container are mutually exclusive");
    }
    if (this.options.password !== undefined && this.options.noAuth) {
      throw new Error("--password and --no-auth are mutually exclusive");
    }
  }
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
                      under --no-auth. Off by default - without this flag,
                      --no-auth disables those routes entirely.
  --quiet-cross-path-hooks
                      Accept event POSTs from hooks bound to a backgrounded
                      path (default: 409 STALE_PATH). Use when you want
                      long-lived agents in idle paths to keep posting.
  --help, -h          Show this help`);
}
