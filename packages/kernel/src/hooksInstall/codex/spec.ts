import {
  FMARK_HOOK_INSTALL_VERSION,
  autoStreamHookCommand,
  autoStreamHookVersion,
  isFmarkAutoStreamCommand,
} from "../command.js";
import type { HookEntry } from "../types.js";

export const CODEX_AUTOSTREAM_EVENTS = [
  "Stop",
  "UserPromptSubmit",
  "PermissionRequest",
  "PostToolUse",
] as const;

type CodexAutostreamEvent = (typeof CODEX_AUTOSTREAM_EVENTS)[number];

interface CodexCommandHook {
  type: "command";
  command: string;
  timeout: number;
  statusMessage?: string;
}

interface CodexHookGroup {
  hooks: CodexCommandHook[];
}

interface CodexHookSnippet {
  hooks: Record<CodexAutostreamEvent, CodexHookGroup[]>;
}

export class CodexHookSpecBuilder {
  readonly agentCommand: string;
  readonly userCommand: string;
  readonly expectedVersion = FMARK_HOOK_INSTALL_VERSION;

  constructor() {
    this.agentCommand = autoStreamHookCommand();
    this.userCommand = autoStreamHookCommand({ kind: "user" });
  }

  expectedEntries(): HookEntry[] {
    return CODEX_AUTOSTREAM_EVENTS.map((event) => ({
      event,
      command: this.commandForEvent(event),
      version: this.expectedVersion,
    }));
  }

  expectedHookGroups(): Record<CodexAutostreamEvent, CodexHookGroup[]> {
    return {
      Stop: [this.group(this.agentCommand, 30)],
      UserPromptSubmit: [this.group(this.userCommand, 10)],
      PermissionRequest: [
        this.group(this.agentCommand, 300, "Waiting for F-Mark access response"),
      ],
      PostToolUse: [this.group(this.agentCommand, 30)],
    };
  }

  isSupportedEvent(event: string): event is CodexAutostreamEvent {
    return CODEX_AUTOSTREAM_EVENTS.includes(event as CodexAutostreamEvent);
  }

  isExpectedEntry(event: string, command: string): boolean {
    if (!this.isSupportedEvent(event)) return false;
    if (command === this.commandForEvent(event)) return true;
    if (!this.isCurrentFmarkCommand(command)) return false;
    return event === "UserPromptSubmit"
      ? this.isUserCommand(command)
      : !this.isUserCommand(command);
  }

  isFmarkCommand(command: string): boolean {
    return isFmarkAutoStreamCommand(command);
  }

  versionFor(command: string): string | null {
    return autoStreamHookVersion(command);
  }

  capturesPermissionRequest(matcher: string | null | undefined): boolean {
    return (
      matcher === undefined ||
      matcher === null ||
      matcher.trim().length === 0 ||
      matcher.includes("mcp") ||
      matcher.includes("fmark") ||
      matcher === ".*" ||
      matcher === "*"
    );
  }

  private commandForEvent(event: CodexAutostreamEvent): string {
    return event === "UserPromptSubmit" ? this.userCommand : this.agentCommand;
  }

  private isCurrentFmarkCommand(command: string): boolean {
    return this.isFmarkCommand(command) && this.versionFor(command) === this.expectedVersion;
  }

  private isUserCommand(command: string): boolean {
    return /(?:^|\s)--kind(?:=|\s+)(?:"user"|'user'|user)(?:\s|$)/.test(command);
  }

  private group(
    command: string,
    timeout: number,
    statusMessage?: string,
  ): CodexHookGroup {
    const hook: CodexCommandHook = { type: "command", command, timeout };
    if (statusMessage !== undefined) hook.statusMessage = statusMessage;
    return { hooks: [hook] };
  }
}

export function createCodexHookSpec(
  _agentId?: string,
  _userId?: string,
): CodexHookSpecBuilder {
  return new CodexHookSpecBuilder();
}

export function createCodexHookSnippet(
  _agentId?: string,
  _userId?: string,
): CodexHookSnippet {
  return {
    hooks: createCodexHookSpec().expectedHookGroups(),
  };
}
