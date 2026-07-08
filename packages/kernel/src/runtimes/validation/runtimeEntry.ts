import { validateExecutable } from "./executable.js";
import { validateArgs } from "./scalars.js";

export interface RuntimeEntryShape {
  displayName: string;
  executable: string;
  args: string[];
  env?: Record<string, string>;
  icon?: string;
  readyDelayMs?: number;
}

export function validateRuntimeEntry(
  entry: unknown,
): asserts entry is RuntimeEntryShape {
  if (!entry || typeof entry !== "object") {
    throw new Error("runtime entry must be an object");
  }
  const runtime = entry as Partial<RuntimeEntryShape>;
  validateDisplayName(runtime.displayName);
  validateExecutable(runtime.executable as string);
  validateArgs(runtime.args);
  validateEnv(runtime.env);
  validateOptionalString(runtime.icon, "icon");
  validateReadyDelay(runtime.readyDelayMs);
}

function validateDisplayName(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("displayName required");
  }
}

function validateEnv(env: unknown): void {
  if (env === undefined) return;
  if (typeof env !== "object" || env === null) {
    throw new Error("env must be an object");
  }
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string") {
      throw new Error(`env.${key} must be a string`);
    }
  }
}

function validateOptionalString(value: unknown, name: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
}

function validateReadyDelay(value: unknown): void {
  if (value !== undefined && typeof value !== "number") {
    throw new Error("readyDelayMs must be a number");
  }
}
