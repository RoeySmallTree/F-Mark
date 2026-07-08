import type { ValidateResult } from "./types.js";

export function validateLineRange(lines: unknown): ValidateResult | null {
  if (!Array.isArray(lines) || lines.length !== 2) {
    return { ok: false, error: "`lines` must be a 2-element array" };
  }
  const [start, end] = lines;
  if (!isPositiveInt(start) || !isPositiveInt(end)) {
    return { ok: false, error: "`lines` entries must be positive integers" };
  }
  if (start > end) {
    return { ok: false, error: "`lines` start must be <= end" };
  }
  return null;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
