import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fmarkAgentSessionName, fmarkTerminalSessionName } from "../naming.js";
import type { TmuxCommandClient } from "./commands.js";
import type { TmuxUserOptions } from "./options.js";
import type { TmuxProjectState } from "./state.js";

interface SpawnAgentInput {
  participantId: string;
  executable: string;
  args: string[];
  env?: Record<string, string>;
  projectRoot?: string;
}

/* tmux rejects server commands over its internal message size (~16 KB) with
   "command too long". Launch argv includes the full launch packet (guide +
   recent-events brief), which grows without bound. Any argv element over
   this size is spilled to a file and expanded by the pane's shell, where
   ARG_MAX (~2 MB) applies instead of tmux's limit. */
const SPILL_ARG_BYTES = 1024;
const SPILL_TRIGGER_TOTAL_BYTES = 8192;

export class TmuxSessionLauncher {
  constructor(
    private readonly commands: TmuxCommandClient,
    private readonly options: TmuxUserOptions,
    private readonly state: TmuxProjectState,
  ) {}

  async spawnAgent(input: SpawnAgentInput): Promise<{ sessionName: string }> {
    const root = this.state.resolveProjectRoot(input.projectRoot);
    const sessionName = fmarkAgentSessionName(root, input.participantId);
    const command = await materializeOversizedArgs({
      executable: input.executable,
      args: input.args,
      spillDir: join(root, ".f-mark", "agents", input.participantId, "spawn-args"),
    });
    await this.commands.newSession([
      "-d",
      "-s",
      sessionName,
      ...buildEnvironmentArgs(
        buildAgentEnvironment(input.env, root, input.participantId),
      ),
      "-c",
      root,
      "--",
      command.executable,
      ...command.args,
    ]);
    await this.options.setProject(sessionName, root);
    await this.options.setParticipant(sessionName, input.participantId);
    return { sessionName };
  }

  async spawnTerminal(input: { index: number }): Promise<{ sessionName: string }> {
    const root = this.state.currentProjectRoot();
    const sessionName = fmarkTerminalSessionName(root, input.index);
    const shell = process.env.SHELL ?? "/bin/sh";
    await this.commands.newSession([
      "-d",
      "-s",
      sessionName,
      "-c",
      root,
      "--",
      shell,
    ]);
    await this.options.setProject(sessionName, root);
    return { sessionName };
  }
}

function buildAgentEnvironment(
  env: Record<string, string> | undefined,
  root: string,
  participantId: string,
): Record<string, string> {
  // Inject F-Mark context so generic hooks can resolve the agent/session
  // without hard-coded participant ids in the user's runtime settings.
  return {
    ...(env ?? {}),
    F_MARK_PATH: env?.F_MARK_PATH ?? root,
    F_MARK_AGENT_ID: participantId,
  };
}

function buildEnvironmentArgs(env: Record<string, string>): string[] {
  const envArgs: string[] = [];
  for (const [k, v] of Object.entries(env)) envArgs.push("-e", `${k}=${v}`);
  return envArgs;
}

/* When the launch command is small, pass it through untouched. Otherwise
   spill every large argv element to a file and exec the runtime through
   `sh -c`, substituting `"$(cat <file>)"` for each spilled element. The
   pane shell re-expands the full-size argv; tmux only ever sees the short
   wrapper script. `exec` keeps the runtime as the pane's own process. */
export async function materializeOversizedArgs(input: {
  executable: string;
  args: string[];
  spillDir: string;
}): Promise<{ executable: string; args: string[] }> {
  const total = [input.executable, ...input.args].reduce(
    (n, a) => n + Buffer.byteLength(a, "utf8") + 1,
    0,
  );
  if (total <= SPILL_TRIGGER_TOTAL_BYTES) {
    return { executable: input.executable, args: input.args };
  }

  await mkdir(input.spillDir, { recursive: true });
  const words: string[] = [shellQuote(input.executable)];
  let spillIndex = 0;
  for (const arg of input.args) {
    if (Buffer.byteLength(arg, "utf8") <= SPILL_ARG_BYTES) {
      words.push(shellQuote(arg));
      continue;
    }
    const file = join(input.spillDir, `arg-${spillIndex}.txt`);
    spillIndex += 1;
    await writeFile(file, arg, "utf8");
    words.push(`"$(cat ${shellQuote(file)})"`);
  }
  return { executable: "/bin/sh", args: ["-c", `exec ${words.join(" ")}`] };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
