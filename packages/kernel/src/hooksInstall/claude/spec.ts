import {
  FMARK_HOOK_INSTALL_VERSION,
  autoStreamHookCommand,
  autoStreamHookVersion,
  isFmarkAutoStreamCommand,
} from "../command.js";
import type { HookEntry } from "../types.js";

const CLAUDE_AUTOSTREAM_EVENTS = [
  "Stop",
  "PermissionRequest",
  "PostToolUse",
  "MessageDisplay",
] as const;

type ClaudeAutostreamEvent = (typeof CLAUDE_AUTOSTREAM_EVENTS)[number];

interface ClaudeCommandHook {
  type: "command";
  command: string;
}

interface ClaudeHookGroup {
  matcher?: string;
  hooks: ClaudeCommandHook[];
}

interface ClaudeHookSnippet {
  hooks: Record<ClaudeAutostreamEvent, ClaudeHookGroup[]>;
}

const CLAUDE_PERMISSION_MATCHER = "Bash|Edit|Write|MultiEdit|Read|WebFetch|WebSearch";

export class ClaudeHookSpecBuilder {
  readonly command: string;
  readonly expectedVersion = FMARK_HOOK_INSTALL_VERSION;

  constructor(command = autoStreamHookCommand()) {
    this.command = command;
  }

  expectedEntries(): HookEntry[] {
    return CLAUDE_AUTOSTREAM_EVENTS.map((event) => ({
      event,
      command: this.command,
      version: this.expectedVersion,
    }));
  }

  isAutostreamEvent(event: string): event is ClaudeAutostreamEvent {
    return CLAUDE_AUTOSTREAM_EVENTS.includes(event as ClaudeAutostreamEvent);
  }

  isExpectedCommand(command: string): boolean {
    return command.trim() === this.command;
  }

  isFmarkCommand(command: string): boolean {
    return isFmarkAutoStreamCommand(command);
  }

  versionFor(command: string): string | null {
    return autoStreamHookVersion(command);
  }

  installGroup(matcher?: string): ClaudeHookGroup {
    return this.group(matcher);
  }

  private commandHook(): ClaudeCommandHook {
    return { type: "command", command: this.command };
  }

  private group(matcher?: string): ClaudeHookGroup {
    const group: ClaudeHookGroup = { hooks: [this.commandHook()] };
    if (matcher) group.matcher = matcher;
    return group;
  }
}

export function createClaudeHookSpec(): ClaudeHookSpecBuilder {
  return new ClaudeHookSpecBuilder();
}

export function createClaudeHookSnippet(
  spec = createClaudeHookSpec(),
): ClaudeHookSnippet {
  return {
    hooks: {
      Stop: [spec.installGroup()],
      PermissionRequest: [spec.installGroup(CLAUDE_PERMISSION_MATCHER)],
      PostToolUse: [spec.installGroup()],
      MessageDisplay: [spec.installGroup()],
    },
  };
}
