import * as autoStream from "../hooks/autoStream.js";

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
  return new CliCommandRunner(argv, opts).run();
}

class CliCommandRunner {
  constructor(
    private readonly argv: string[],
    private readonly opts: { stdin?: string },
  ) {}

  async run(): Promise<number> {
    if (this.isAutoStreamHook()) return this.runAutoStreamHook();
    if (this.argv[0] === "mcp") return this.runMcp();
    return this.fail(`unknown subcommand: ${this.argv.join(" ")}`);
  }

  private isAutoStreamHook(): boolean {
    return this.argv[0] === "hook" && this.argv[1] === "auto-stream";
  }

  private async runAutoStreamHook(): Promise<number> {
    const participantId = this.hookParticipantId();
    const kind = this.hookKind();
    if (kind !== "assistant" && kind !== "user") {
      return this.fail(`unknown --kind value: ${kind}`);
    }
    const stdinRaw = this.opts.stdin ?? (await readAllStdin());
    return autoStream.runAutoStream(participantId, kind, stdinRaw);
  }

  private hookParticipantId(): string | null {
    const maybeParticipantId = this.argv[2];
    return maybeParticipantId !== undefined && !maybeParticipantId.startsWith("--")
      ? maybeParticipantId
      : null;
  }

  private hookKind(): string {
    const kindFlag = this.argv.indexOf("--kind");
    return kindFlag >= 0 ? this.argv[kindFlag + 1] ?? "assistant" : "assistant";
  }

  private async runMcp(): Promise<number> {
    const parsed = this.parseMcpArgs();
    if (parsed.kind === "error") return this.fail(parsed.message);
    if (parsed.kind === "help") {
      process.stderr.write("Usage: f-mark mcp [--path <abs-dir>]\n");
      return 0;
    }
    return this.startMcp(parsed.path);
  }

  private parseMcpArgs():
    | { kind: "run"; path?: string }
    | { kind: "help" }
    | { kind: "error"; message: string } {
    let path: string | undefined;
    for (let index = 1; index < this.argv.length; index++) {
      const parsed = this.parseMcpArg(index);
      if (parsed.kind === "error" || parsed.kind === "help") return parsed;
      if (parsed.path !== undefined) {
        path = parsed.path;
        index++;
      }
    }
    return { kind: "run", path };
  }

  private parseMcpArg(
    index: number,
  ):
    | { kind: "run"; path?: string }
    | { kind: "help" }
    | { kind: "error"; message: string } {
    const arg = this.argv[index];
    if (arg === "--path") return this.parseMcpPath(index);
    if (arg === "--help" || arg === "-h") return { kind: "help" };
    return { kind: "error", message: `unknown mcp argument: ${arg}` };
  }

  private parseMcpPath(
    index: number,
  ): { kind: "run"; path: string } | { kind: "error"; message: string } {
    const value = this.argv[index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) {
      return { kind: "error", message: "--path requires an absolute directory" };
    }
    if (!value.startsWith("/")) {
      return { kind: "error", message: `--path must be absolute: ${value}` };
    }
    return { kind: "run", path: value };
  }

  private async startMcp(path: string | undefined): Promise<number> {
    const { runFmarkMcpStdio } = await import("../mcp/stdio.js");
    try {
      await runFmarkMcpStdio({ path });
      return 0;
    } catch (err) {
      return this.fail(
        `f-mark mcp failed: ${err instanceof Error ? err.message : String(err)}`,
        1,
      );
    }
  }

  private fail(message: string, code = 2): number {
    process.stderr.write(`${message}\n`);
    return code;
  }
}
