const EXECUTABLE_RE = /^[a-zA-Z0-9_./-]+$/;
const SLASH_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/;

export function validateExecutable(value: string): void {
  if (typeof value !== "string" || value.length === 0) throw new Error("invalid executable: empty");
  if (!EXECUTABLE_RE.test(value)) throw new Error(`invalid executable: ${value}`);
}

export function validateArgs(args: unknown): asserts args is string[] {
  if (!Array.isArray(args)) throw new Error("args must be an array");
  for (const a of args) {
    if (typeof a !== "string") throw new Error("args must be strings");
  }
}

export function validateSlashCommand(value: string): void {
  if (!SLASH_RE.test(value)) throw new Error(`invalid slash command: ${value}`);
}

export function validateMessageText(text: string): void {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if ((c < 0x20 && c !== 0x09) || c === 0x7f) throw new Error(`message contains control char at index ${i}`);
  }
}

export interface RuntimeEntryShape {
  displayName: string;
  executable: string;
  args: string[];
  env?: Record<string, string>;
  icon?: string;
  readyDelayMs?: number;
}

export function validateRuntimeEntry(entry: unknown): asserts entry is RuntimeEntryShape {
  if (!entry || typeof entry !== "object") throw new Error("runtime entry must be an object");
  const e = entry as Partial<RuntimeEntryShape>;
  if (typeof e.displayName !== "string" || e.displayName.length === 0) throw new Error("displayName required");
  validateExecutable(e.executable as string);
  validateArgs(e.args);
  if (e.env !== undefined) {
    if (typeof e.env !== "object" || e.env === null) throw new Error("env must be an object");
    for (const [k, v] of Object.entries(e.env)) {
      if (typeof v !== "string") throw new Error(`env.${k} must be a string`);
    }
  }
  if (e.icon !== undefined && typeof e.icon !== "string") throw new Error("icon must be a string");
  if (e.readyDelayMs !== undefined && typeof e.readyDelayMs !== "number") throw new Error("readyDelayMs must be a number");
}
