type Level = "info" | "warn" | "error";

function format(level: Level, message: string): string {
  return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
}

export function info(message: string): void {
  console.log(format("info", message));
}

export function warn(message: string): void {
  console.warn(format("warn", message));
}

export function error(message: string): void {
  console.error(format("error", message));
}
