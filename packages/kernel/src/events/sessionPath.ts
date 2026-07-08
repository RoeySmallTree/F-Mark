import { resolve } from "node:path";
import { toIsoTimestamp } from "@f-mark/shared";
import type { Paths } from "../paths.js";

export function assertWithinSession(
  p: Paths,
  sessionId: string,
  target: string,
): void {
  const sessionRoot = resolve(p.sessionDir(sessionId));
  const targetResolved = resolve(target);
  if (
    !targetResolved.startsWith(`${sessionRoot}/`) &&
    targetResolved !== sessionRoot
  ) {
    throw new Error("path escapes session root");
  }
}

function parseCompactTimestamp(timestamp: string): Date {
  const ms = timestamp.length === 20 ? timestamp.slice(16, 19) : "000";
  return new Date(
    `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}.${ms}Z`,
  );
}

export function bumpMillisecond(timestamp: string): string {
  const date = parseCompactTimestamp(timestamp);
  date.setUTCMilliseconds(date.getUTCMilliseconds() + 1);
  return toIsoTimestamp(date);
}
