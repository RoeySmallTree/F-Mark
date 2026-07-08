const SLASH_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/;

export function validateArgs(args: unknown): asserts args is string[] {
  if (!Array.isArray(args)) throw new Error("args must be an array");
  for (const arg of args) {
    if (typeof arg !== "string") throw new Error("args must be strings");
  }
}

export function validateSlashCommand(value: string): void {
  if (!SLASH_RE.test(value)) {
    throw new Error(`invalid slash command: ${value}`);
  }
}

export function validateMessageText(text: string): void {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if ((code < 0x20 && code !== 0x09) || code === 0x7f) {
      throw new Error(`message contains control char at index ${index}`);
    }
  }
}
