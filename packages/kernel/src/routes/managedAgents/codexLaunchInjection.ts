import { fmarkMcpCommandSpec } from "../../mcpInstall/types.js";
import { codexFmarkMcpApprovalConfigArgs } from "../../mcpInstall/codex.js";
import { createCodexHookSpec } from "../../hooksInstall/codex/spec.js";

/* Codex managed launch injects the entire `fmark` MCP server and the F-Mark
   autostream hooks per invocation via `-c` overrides, instead of writing them
   into the machine-global `~/.codex/{config.toml,hooks.json}`. That keeps
   manually-launched (non-F-Mark) codex sessions completely free of the fmark
   MCP server and hooks. See planning/codex-per-launch-injection/summary.md. */

type TomlInlineValue =
  | string
  | number
  | boolean
  | TomlInlineValue[]
  | { [key: string]: TomlInlineValue | undefined };

function tomlBareOrQuotedKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

/** Serialize a value as a TOML inline value (string/number/bool/array/inline
    table). `JSON.stringify` is used only for strings — its escaping is a valid
    subset of TOML basic-string escaping — never for hand-built quoting. */
export function serializeTomlInlineValue(value: TomlInlineValue): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeTomlInlineValue).join(",")}]`;
  }
  const entries = Object.entries(value).filter(
    (entry): entry is [string, TomlInlineValue] => entry[1] !== undefined,
  );
  return `{${entries
    .map(([key, inner]) => `${tomlBareOrQuotedKey(key)}=${serializeTomlInlineValue(inner)}`)
    .join(",")}}`;
}

function configArg(key: string, value: TomlInlineValue): string[] {
  return ["-c", `${key}=${serializeTomlInlineValue(value)}`];
}

/** `-c` overrides that fully define `mcp_servers.fmark` for a managed codex
    launch: command/args (with `--path <projectRoot>`), the version env, the
    default approval mode, and each tool's approval override. */
export function codexFmarkMcpLaunchArgs(input: {
  projectRoot: string;
  env: NodeJS.ProcessEnv;
}): string[] {
  const spec = fmarkMcpCommandSpec(input.projectRoot, input.env);
  const args: string[] = [
    ...configArg("mcp_servers.fmark.command", spec.command),
    ...configArg("mcp_servers.fmark.args", spec.args),
  ];
  for (const [key, value] of Object.entries(spec.env)) {
    args.push(...configArg(`mcp_servers.fmark.env.${key}`, value));
  }
  args.push(
    ...configArg("mcp_servers.fmark.default_tools_approval_mode", "prompt"),
    ...codexFmarkMcpApprovalConfigArgs(),
  );
  return args;
}

/** The trust-bypass flag plus `-c hooks.<Event>` overrides that install the
    F-Mark autostream hooks for a managed codex launch only. The hook commands
    are the generic env-resolved autostream commands (no baked participant id);
    managed panes provide `F_MARK_AGENT_ID`/`F_MARK_USER_ID` in their env. */
export function codexFmarkHookLaunchArgs(): string[] {
  const spec = createCodexHookSpec();
  const groups = spec.expectedHookGroups();
  // `--dangerously-bypass-hook-trust` runs the injected hooks without persisted
  // trust for this invocation. F-Mark is the sole author of these hooks, so it
  // vets its own source; the flag is scoped to the managed launch process.
  const args: string[] = ["--dangerously-bypass-hook-trust"];
  for (const [event, eventGroups] of Object.entries(groups)) {
    // The hook groups are plain data ({hooks:[{type,command,timeout,...}]}); the
    // serializer walks them structurally at runtime.
    args.push(...configArg(`hooks.${event}`, eventGroups as unknown as TomlInlineValue));
  }
  return args;
}

/** Full F-Mark codex managed-launch injection: MCP server + hooks. */
export function codexFmarkLaunchArgs(input: {
  projectRoot: string;
  env: NodeJS.ProcessEnv;
}): string[] {
  return [...codexFmarkMcpLaunchArgs(input), ...codexFmarkHookLaunchArgs()];
}

/** Codex native-fork argv: base runtime args, then F-Mark's `-c`/trust-bypass
    injection (global options must precede the subcommand), then the `fork
    <handle>` subcommand. A forked codex pane is a managed launch too, so it
    needs the same MCP + hooks as spawn/resume. */
export function codexForkArgs(
  baseArgs: string[],
  sourceHandle: string,
  input: { projectRoot: string; env: NodeJS.ProcessEnv },
): string[] {
  return [...baseArgs, ...codexFmarkLaunchArgs(input), "fork", sourceHandle];
}
