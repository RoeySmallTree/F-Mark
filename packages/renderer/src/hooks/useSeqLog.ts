import { useMemo } from "react";

const SEQ_URL = "http://localhost:5455";
const APP_NAME = "f-mark";

/* Suppress in test environments so log fetches don't pollute fetch-mock
   call counts. Vitest exposes process.env.VITEST; Vite sets MODE === "test"
   when invoked through vitest. Either signal is sufficient. */
function isTestEnvironment(): boolean {
  try {
    const env = (import.meta as unknown as { env?: { MODE?: string } }).env;
    if (env?.MODE === "test") return true;
  } catch {
    /* ignore — import.meta may be unavailable in some bundling modes */
  }
  if (
    typeof process !== "undefined" &&
    typeof process.env?.VITEST === "string"
  ) {
    return true;
  }
  return false;
}

const SUPPRESSED = isTestEnvironment();

export enum LogLevel {
  Verbose = "Verbose",
  Debug = "Debug",
  Info = "Information",
  Warning = "Warning",
  Error = "Error",
}

type LogProps = Record<string, unknown>;

function sendSeq(message: string, props: LogProps, level: LogLevel) {
  const { $note, $hideWhen, ...rest } = props as LogProps & { $note?: string; $hideWhen?: boolean };
  if ($hideWhen) return;
  if (SUPPRESSED) return;
  fetch(`${SEQ_URL}/api/events/raw`, {
    method: "POST",
    headers: { "Content-Type": "application/vnd.serilog.clef" },
    body: JSON.stringify({
      "@t": new Date().toISOString(),
      "@l": level,
      "@mt": message,
      app: APP_NAME,
      layer: "frontend",
      ...($note !== undefined && { note: $note }),
      ...rest,
    }),
  }).catch(() => {});
}

export function useSeqLog(component: string, context?: LogProps) {
  return useMemo(
    () =>
      (msg: string, propsOrLevel?: LogProps | LogLevel, maybeLevel?: LogLevel) => {
        const props = typeof propsOrLevel === "object" ? propsOrLevel : undefined;
        const level = typeof propsOrLevel === "string" ? propsOrLevel : (maybeLevel ?? LogLevel.Debug);
        sendSeq(msg, { component, ...context, ...props }, level);
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [component, JSON.stringify(context)],
  );
}
